/**
 * Audit engine — pure parts.
 *
 * A rule detects findings (things that are currently wrong). The engine
 * reconciles findings against existing engine-created tasks so that:
 *   - a finding with no open task  → create one
 *   - an open task whose finding has gone → resolve it automatically
 *   - an open task overdue by the rule's escalation window → escalate once
 * Running the engine twice changes nothing the second time (idempotent).
 */
import type { Role } from "@/db/schema";

export type Finding = {
  subjectKey: string; // e.g. "risk_assessment:<id>" — stable identity of the thing that's wrong
  title: string;
  detail?: string;
  childId?: string | null;
  dueAt: Date;
  ownerRole?: Role; // override the rule's default owner
  ownerUserId?: string | null; // e.g. the key worker
};

export type RuleDef = {
  key: string;
  name: string;
  regulation: string;
  description: string;
  ownerRole: Role;
  /** Days overdue before an escalation task is created for `escalateTo`. */
  escalateAfterDays?: number;
  escalateTo?: Role;
  /** Weight in the compliance score (points deducted per finding, capped per rule). */
  weight: number;
  cap: number;
};

export type ExistingTask = {
  id: string;
  ruleKey: string;
  subjectKey: string | null;
  status: "open" | "done" | "not_applicable";
  dueAt: Date;
  escalatedAt: Date | null;
};

export type Reconciliation = {
  create: Finding[];
  resolve: string[]; // task ids
  escalate: Array<{ taskId: string; finding: ExistingTask }>;
};

export function reconcile(rule: RuleDef, findings: Finding[], existing: ExistingTask[], now = new Date()): Reconciliation {
  const open = existing.filter((t) => t.ruleKey === rule.key && t.status === "open");
  const byKey = new Map(open.map((t) => [t.subjectKey, t]));
  const seen = new Set<string>();
  const create: Finding[] = [];
  const escalate: Reconciliation["escalate"] = [];

  for (const f of findings) {
    seen.add(f.subjectKey);
    const t = byKey.get(f.subjectKey);
    if (!t) { create.push(f); continue; }
    if (rule.escalateAfterDays && rule.escalateTo && !t.escalatedAt && now.getTime() - t.dueAt.getTime() > rule.escalateAfterDays * 86_400_000) {
      escalate.push({ taskId: t.id, finding: t });
    }
  }
  const resolve = open.filter((t) => t.subjectKey && !seen.has(t.subjectKey)).map((t) => t.id);
  return { create, resolve, escalate };
}

export const RULES: RuleDef[] = [
  { key: "risk.review_overdue", name: "Risk assessment review overdue", regulation: "Reg 12", description: "A current risk assessment is past its review date.", ownerRole: "care_worker", escalateAfterDays: 7, escalateTo: "registered_manager", weight: 4, cap: 20 },
  { key: "plan.missing", name: "No placement plan", regulation: "Reg 17", description: "A child has been placed for more than 5 days without a placement plan.", ownerRole: "registered_manager", escalateAfterDays: 7, escalateTo: "responsible_individual", weight: 8, cap: 16 },
  { key: "plan.review_overdue", name: "Placement plan review overdue", regulation: "Reg 17, Reg 14", description: "The current placement plan is past its review date.", ownerRole: "deputy", escalateAfterDays: 14, escalateTo: "registered_manager", weight: 3, cap: 12 },
  { key: "supervision.overdue", name: "Supervision overdue", regulation: "Reg 33(4)(b)", description: "A member of care staff has not had supervision within the required interval.", ownerRole: "registered_manager", escalateAfterDays: 14, escalateTo: "responsible_individual", weight: 4, cap: 16 },
  { key: "schedule2.incomplete", name: "Schedule 2 file incomplete", regulation: "Reg 32, Schedule 2", description: "A member of staff is working without a complete fitness file.", ownerRole: "registered_manager", escalateAfterDays: 7, escalateTo: "responsible_individual", weight: 6, cap: 18 },
  { key: "training.expired", name: "Mandatory training expired", regulation: "Reg 33", description: "A mandatory training certificate has expired.", ownerRole: "deputy", escalateAfterDays: 30, escalateTo: "registered_manager", weight: 2, cap: 10 },
  { key: "staff.level3_overdue", name: "Level 3 qualification overdue", regulation: "Reg 32(4)", description: "Two years have passed since start without the Level 3 Diploma.", ownerRole: "registered_manager", weight: 4, cap: 8 },
  { key: "reg44.overdue", name: "Reg 44 visit overdue", regulation: "Reg 44(1)", description: "More than a month since the last independent person's visit.", ownerRole: "responsible_individual", weight: 10, cap: 10 },
  { key: "reg45.due", name: "Reg 45 review due", regulation: "Reg 45(1)", description: "The six-monthly quality of care review is due within 30 days or overdue.", ownerRole: "registered_manager", escalateAfterDays: 14, escalateTo: "responsible_individual", weight: 8, cap: 8 },
  { key: "logs.missing", name: "Daily logs missing", regulation: "Reg 36", description: "Child-days in the last 7 days with no submitted daily log.", ownerRole: "deputy", weight: 1, cap: 8 },
  { key: "logs.unreviewed", name: "Daily logs awaiting review", regulation: "Reg 13", description: "Submitted daily logs older than 3 days not yet reviewed.", ownerRole: "deputy", weight: 1, cap: 5 },
  { key: "notification.unsent", name: "Required notification not sent", regulation: "Reg 40", description: "An incident flagged as notifiable has no matching notification recorded after 24 hours.", ownerRole: "registered_manager", escalateAfterDays: 2, escalateTo: "responsible_individual", weight: 10, cap: 20 },
  { key: "incident.unreviewed", name: "Incident not reviewed", regulation: "Reg 13", description: "An incident submitted more than 3 days ago has not been reviewed or locked by a manager.", ownerRole: "registered_manager", escalateAfterDays: 4, escalateTo: "responsible_individual", weight: 3, cap: 12 },
  { key: "checks.overdue", name: "Safety check overdue", regulation: "Reg 25, Reg 46", description: "A scheduled safety or fire check is overdue.", ownerRole: "deputy", escalateAfterDays: 7, escalateTo: "registered_manager", weight: 3, cap: 12 },
  { key: "sop.missing", name: "Statement of Purpose missing or not notified", regulation: "Reg 16", description: "No current Statement of Purpose, or the current version has not been sent to Ofsted.", ownerRole: "registered_manager", weight: 8, cap: 8 },
  { key: "policy.review_overdue", name: "Policy review overdue", regulation: "Reg 34", description: "A policy is past its review date.", ownerRole: "registered_manager", weight: 2, cap: 6 },
  { key: "voice.unanswered", name: "Child's voice without an outcome", regulation: "Reg 7", description: "Something a child said more than 7 days ago has no recorded outcome.", ownerRole: "care_worker", escalateAfterDays: 7, escalateTo: "deputy", weight: 2, cap: 10 },
  { key: "keywork.stale", name: "No key-work in 28 days", regulation: "Reg 11, Reg 7", description: "A child has had no key-work session in the last four weeks.", ownerRole: "care_worker", escalateAfterDays: 7, escalateTo: "deputy", weight: 2, cap: 8 },
  { key: "medication.consent_missing", name: "Medication without recorded consent", regulation: "Reg 23", description: "A current medication has no consent date recorded.", ownerRole: "registered_manager", weight: 3, cap: 9 },
];

export const RULE_BY_KEY = Object.fromEntries(RULES.map((r) => [r.key, r]));

/** 100 minus weighted, capped deductions. */
export function complianceScore(findingCounts: Record<string, number>): { score: number; deductions: Array<{ key: string; points: number; findings: number }> } {
  const deductions: Array<{ key: string; points: number; findings: number }> = [];
  let total = 0;
  for (const r of RULES) {
    const n = findingCounts[r.key] ?? 0;
    if (n <= 0) continue;
    const points = Math.min(r.cap, n * r.weight);
    deductions.push({ key: r.key, points, findings: n });
    total += points;
  }
  return { score: Math.max(0, 100 - total), deductions: deductions.sort((a, b) => b.points - a.points) };
}

export function scoreBand(score: number): { label: string; tone: "ok" | "warn" | "bad" } {
  if (score >= 85) return { label: "Good", tone: "ok" };
  if (score >= 65) return { label: "Requires attention", tone: "warn" };
  return { label: "Serious gaps", tone: "bad" };
}
