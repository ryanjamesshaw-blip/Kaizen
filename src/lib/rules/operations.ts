/**
 * Home-operations compliance rules. Pure.
 */
import type { StaffRecord } from "@/db/schema";

const DAY = 86_400_000;

// ---- Supervision (Reg 33(4)(b)) — frequency is the provider's policy; defaults here ----
export const SUPERVISION_DAYS_PROBATION = 28; // monthly during probation
export const SUPERVISION_DAYS_STANDARD = 42; // six-weekly thereafter
export const APPRAISAL_DAYS = 365;

export function supervisionDueOn(lastHeldOn: Date | null, startDate: Date | null, probationEndsOn: Date | null, now = new Date()): Date {
  const inProbation = probationEndsOn ? probationEndsOn > now : false;
  const interval = inProbation ? SUPERVISION_DAYS_PROBATION : SUPERVISION_DAYS_STANDARD;
  const base = lastHeldOn ?? startDate ?? now;
  return new Date(base.getTime() + interval * DAY);
}

export type SupervisionStatus = "ok" | "due_soon" | "overdue" | "never";
export function supervisionStatus(lastHeldOn: Date | null, dueOn: Date, now = new Date()): SupervisionStatus {
  if (!lastHeldOn) return now > dueOn ? "overdue" : "never";
  if (now > dueOn) return "overdue";
  if (dueOn.getTime() - now.getTime() < 7 * DAY) return "due_soon";
  return "ok";
}

// ---- Schedule 2 fitness ----
export const SCHEDULE_2_ITEMS: Array<{ key: keyof StaffRecord; label: string; para: string }> = [
  { key: "idVerifiedOn", label: "Proof of identity", para: "Sch 2 para 1" },
  { key: "photoOnFile", label: "Recent photograph", para: "Sch 2 para 1" },
  { key: "dbsIssuedOn", label: "Enhanced DBS with barred list check", para: "Sch 2 para 2" },
  { key: "reference1ReceivedOn", label: "First written reference", para: "Sch 2 para 3" },
  { key: "reference2ReceivedOn", label: "Second written reference (most recent employer)", para: "Sch 2 para 3" },
  { key: "previousCareEmployerVerifiedOn", label: "Verification of reason for leaving previous care/children's work", para: "Sch 2 para 4" },
  { key: "qualificationsVerifiedOn", label: "Qualifications verified", para: "Sch 2 para 5" },
  { key: "employmentHistoryCompleteOn", label: "Full employment history with gaps explained", para: "Sch 2 para 6" },
  { key: "rightToWorkVerifiedOn", label: "Right to work", para: "Good practice" },
  { key: "healthDeclarationOn", label: "Health declaration (Reg 32(3)(d))", para: "Reg 32" },
];

export function schedule2Missing(r: Partial<StaffRecord> | null): string[] {
  if (!r) return SCHEDULE_2_ITEMS.map((i) => i.label);
  return SCHEDULE_2_ITEMS.filter((i) => {
    const v = r[i.key];
    return v === null || v === undefined || v === false;
  }).map((i) => i.label);
}

/** Reg 32(4)/(5): Level 3 diploma within 2 years of starting in a care role. */
export function level3Status(r: Pick<StaffRecord, "startDate" | "level3AchievedOn">, now = new Date()): "achieved" | "within_window" | "overdue" | "unknown" {
  if (r.level3AchievedOn) return "achieved";
  if (!r.startDate) return "unknown";
  const deadline = new Date(r.startDate.getTime() + 2 * 365 * DAY);
  return now > deadline ? "overdue" : "within_window";
}

export function dbsStatus(issuedOn: Date | null, updateService: boolean, now = new Date()): "ok" | "renew" | "missing" {
  if (!issuedOn) return "missing";
  if (updateService) return "ok";
  return now.getTime() - issuedOn.getTime() > 3 * 365 * DAY ? "renew" : "ok";
}

// ---- Training ----
export type TrainingStatus = "valid" | "expiring" | "expired" | "no_expiry";
export function trainingStatus(expiresOn: Date | null, now = new Date()): TrainingStatus {
  if (!expiresOn) return "no_expiry";
  if (expiresOn < now) return "expired";
  if (expiresOn.getTime() - now.getTime() < 60 * DAY) return "expiring";
  return "valid";
}

/** Courses every care-facing member of staff should hold. Provider policy; sensible defaults. */
export const MANDATORY_COURSES = [
  "Safeguarding children (Level 2+)",
  "Physical intervention / behaviour support",
  "First aid (paediatric)",
  "Fire safety",
  "Medication administration",
  "Food hygiene",
  "Prevent",
  "Child sexual and criminal exploitation",
  "Online safety",
  "Equality and diversity",
];

// ---- Checks ----
export function checkDueOn(lastCheckedOn: Date | null, frequencyDays: number, createdAt: Date): Date {
  const base = lastCheckedOn ?? createdAt;
  return new Date(base.getTime() + frequencyDays * DAY);
}
export function checkStatus(dueOn: Date, now = new Date()): "ok" | "due_soon" | "overdue" {
  if (now > dueOn) return "overdue";
  if (dueOn.getTime() - now.getTime() < 3 * DAY) return "due_soon";
  return "ok";
}

/** Default check schedule for a new home. */
export const DEFAULT_CHECKS: Array<{ name: string; frequencyDays: number; regulation: string; guidance?: string }> = [
  { name: "Fire alarm test", frequencyDays: 7, regulation: "Reg 25, RRO 2005" },
  { name: "Fire drill (day)", frequencyDays: 90, regulation: "Reg 25, Sch 4 para 6" },
  { name: "Fire drill (night / sleeping)", frequencyDays: 180, regulation: "Reg 25, Sch 4 para 6" },
  { name: "Emergency lighting test", frequencyDays: 30, regulation: "Reg 25" },
  { name: "Fire extinguishers visual", frequencyDays: 30, regulation: "Reg 25" },
  { name: "Water temperature / legionella flush", frequencyDays: 30, regulation: "Reg 46, HSG274" },
  { name: "First aid kit", frequencyDays: 30, regulation: "Reg 10" },
  { name: "Medication cabinet and stock reconciliation", frequencyDays: 7, regulation: "Reg 23" },
  { name: "Window restrictors and locks", frequencyDays: 30, regulation: "Reg 12, Reg 46" },
  { name: "Vehicle (tyres, lights, documents)", frequencyDays: 7, regulation: "Reg 10, Reg 46" },
  { name: "Bedroom and environment walk-round", frequencyDays: 7, regulation: "Reg 6, Reg 46" },
  { name: "Gas safety certificate", frequencyDays: 365, regulation: "Gas Safety Regs 1998" },
  { name: "Electrical installation (EICR)", frequencyDays: 365 * 5, regulation: "Electricity at Work Regs" },
  { name: "PAT testing", frequencyDays: 365, regulation: "Electricity at Work Regs" },
];

// ---- Money ----
export function balancePence(entries: Array<{ amountPence: number }>): number {
  return entries.reduce((s, e) => s + e.amountPence, 0);
}
export function fmtPence(p: number): string {
  const sign = p < 0 ? "-" : "";
  return `${sign}£${(Math.abs(p) / 100).toFixed(2)}`;
}
