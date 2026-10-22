"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { checkResults, checkTypes, children, homeDocuments, homes, maintenanceItems, marEntries, medications, moneyLedger, staffRecords, supervisions, trainingRecords } from "@/db/schema";
import { audit } from "@/lib/audit";
import { Forbidden, requirePermission, requireUser } from "@/lib/auth/guard";
import { can } from "@/lib/rbac";
import { memberships } from "@/db/schema";

/** staff:manage at organisation level, or at home level for any home the member of staff belongs to. */
async function requireStaffManage(organisationId: string, staffUserId: string, formHomeId?: string | null) {
  const user = await requireUser();
  if (can(user.grants, "staff:manage", { organisationId })) return user;
  const theirs = await db.select({ homeId: memberships.homeId }).from(memberships).where(and(eq(memberships.userId, staffUserId), eq(memberships.organisationId, organisationId)));
  const homeIds = [...new Set([...theirs.map((m) => m.homeId), formHomeId].filter(Boolean) as string[])];
  if (homeIds.some((h) => can(user.grants, "staff:manage", { organisationId, homeId: h }))) return user;
  throw new Forbidden("Missing staff:manage");
}
import { requestMeta } from "@/lib/auth/session";
import { DEFAULT_CHECKS } from "@/lib/rules/operations";
import type { ActionState } from "@/lib/children/actions";

const optText = z.string().optional().transform((s) => (s?.trim() ? s.trim() : null));
const optDate = z.string().optional().transform((s) => (s ? new Date(`${s}T00:00:00Z`) : null));
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").transform((s) => new Date(`${s}T00:00:00Z`));
const dt = z.string().min(1).transform((s) => new Date(s));
const flag = z.string().optional().transform((s) => s === "on");

async function home(homeId: string) {
  const [h] = await db.select().from(homes).where(eq(homes.id, homeId)).limit(1);
  if (!h) throw new Error("Home not found");
  return h;
}

// ---- Staff record (Sch 2) ----
export async function saveStaffRecord(organisationId: string, userId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaffManage(organisationId, userId, String(fd.get("homeId") ?? "") || null);
  const parsed = z.object({
    homeId: z.string().uuid().optional().or(z.literal("")).transform((s) => s || null),
    jobTitle: optText, startDate: optDate, probationEndsOn: optDate,
    idVerifiedOn: optDate, photoOnFile: flag, dbsNumber: optText, dbsIssuedOn: optDate, dbsUpdateService: flag,
    reference1ReceivedOn: optDate, reference1From: optText, reference2ReceivedOn: optDate, reference2From: optText,
    previousCareEmployerVerifiedOn: optDate, qualificationsVerifiedOn: optDate, employmentHistoryCompleteOn: optDate, employmentGapsExplained: optText,
    rightToWorkVerifiedOn: optDate, healthDeclarationOn: optDate,
    level3Qualification: optText, level3AchievedOn: optDate, level5Qualification: optText, level5AchievedOn: optDate, inductionCompletedOn: optDate, notes: optText,
  }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const [existing] = await db.select().from(staffRecords).where(and(eq(staffRecords.organisationId, organisationId), eq(staffRecords.userId, userId))).limit(1);
  if (existing) await db.update(staffRecords).set({ ...parsed.data, updatedAt: new Date(), updatedBy: user.id }).where(eq(staffRecords.id, existing.id));
  else await db.insert(staffRecords).values({ ...parsed.data, organisationId, userId, updatedBy: user.id });
  await audit({ organisationId, homeId: parsed.data.homeId, actorUserId: user.id, actorRole: user.role, action: existing ? "update" : "create", entityType: "staff_record", entityId: userId, diff: { after: { ...parsed.data, dbsNumber: parsed.data.dbsNumber ? "set" : null } }, ...(await requestMeta()) });
  revalidatePath(`/staff/${userId}`);
  return { ok: true };
}

export async function addSupervision(homeId: string, staffUserId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const h = await home(homeId);
  const user = await requirePermission("staff:manage", { organisationId: h.organisationId, homeId });
  const parsed = z.object({ heldOn: dateStr, kind: z.enum(["supervision", "appraisal", "probation_review"]), wellbeing: optText, caseDiscussion: optText, practiceAndDevelopment: optText, safeguardingDiscussed: flag, actions: optText, nextDueOn: optDate }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const [s] = await db.insert(supervisions).values({ ...parsed.data, organisationId: h.organisationId, homeId, staffUserId, supervisorUserId: user.id, supervisorSignedAt: new Date(), createdBy: user.id }).returning({ id: supervisions.id });
  await audit({ organisationId: h.organisationId, homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "supervision", entityId: s.id, diff: { after: { staffUserId, heldOn: parsed.data.heldOn, kind: parsed.data.kind } }, ...(await requestMeta()) });
  revalidatePath(`/staff/${staffUserId}`);
  return { ok: true };
}

export async function signSupervision(id: string): Promise<void> {
  const [s] = await db.select().from(supervisions).where(eq(supervisions.id, id)).limit(1);
  if (!s) return;
  const user = await requirePermission("home:read", { organisationId: s.organisationId, homeId: s.homeId });
  if (user.id !== s.staffUserId) throw new Error("Only the member of staff can sign their own supervision");
  await db.update(supervisions).set({ staffSignedAt: new Date() }).where(eq(supervisions.id, id));
  await audit({ organisationId: s.organisationId, homeId: s.homeId, actorUserId: user.id, actorRole: user.role, action: "update", entityType: "supervision", entityId: id, diff: { after: { staffSigned: true } }, ...(await requestMeta()) });
  revalidatePath(`/staff/${s.staffUserId}`);
}

export async function addTraining(organisationId: string, staffUserId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaffManage(organisationId, staffUserId, String(fd.get("homeId") ?? "") || null);
  const parsed = z.object({ course: z.string().trim().min(1, "Course is required"), provider: optText, completedOn: dateStr, expiresOn: optDate, certificateRef: optText, homeId: z.string().uuid().optional().or(z.literal("")).transform((s) => s || null) }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const [t] = await db.insert(trainingRecords).values({ ...parsed.data, organisationId, staffUserId, createdBy: user.id }).returning({ id: trainingRecords.id });
  await audit({ organisationId, homeId: parsed.data.homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "training_record", entityId: t.id, diff: { after: parsed.data }, ...(await requestMeta()) });
  revalidatePath(`/staff/${staffUserId}`);
  return { ok: true };
}

// ---- Medication ----
export async function addMedication(childId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [c] = await db.select().from(children).where(eq(children.id, childId)).limit(1);
  if (!c) return { error: "Child not found" };
  const user = await requirePermission("record:review", { organisationId: c.organisationId, homeId: c.homeId });
  const parsed = z.object({ name: z.string().trim().min(1, "Name is required"), dose: z.string().trim().min(1, "Dose is required"), route: z.string().trim().min(1), frequency: z.string().trim().min(1, "Frequency is required"), prn: flag, prnInstructions: optText, prescribedBy: optText, reason: optText, controlledDrug: flag, homely: flag, startOn: dateStr, endOn: optDate, stockCount: z.string().optional().transform((s) => (s ? Number(s) : null)), consentRecordedOn: optDate }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const [m] = await db.insert(medications).values({ ...parsed.data, organisationId: c.organisationId, homeId: c.homeId, childId, createdBy: user.id }).returning({ id: medications.id });
  await audit({ organisationId: c.organisationId, homeId: c.homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "medication", entityId: m.id, diff: { after: { name: parsed.data.name, dose: parsed.data.dose } }, ...(await requestMeta()) });
  revalidatePath(`/children/${childId}/medication`);
  return { ok: true };
}

export async function recordMar(medicationId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [m] = await db.select().from(medications).where(eq(medications.id, medicationId)).limit(1);
  if (!m) return { error: "Not found" };
  const user = await requirePermission("child:write", { organisationId: m.organisationId, homeId: m.homeId });
  const parsed = z.object({ administeredAt: dt, outcome: z.enum(["given", "refused", "missed", "not_required", "error", "destroyed"]), doseGiven: optText, witnessedBy: z.string().uuid().optional().or(z.literal("")).transform((s) => s || null), stockAfter: z.string().optional().transform((s) => (s ? Number(s) : null)), notes: optText }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  if (m.controlledDrug && parsed.data.outcome === "given" && !parsed.data.witnessedBy) return { error: "Controlled drugs must be witnessed by a second member of staff" };
  if (parsed.data.outcome === "error" && !parsed.data.notes) return { error: "Describe the error — and record it as a medication-error incident" };
  await db.transaction(async (tx) => {
    await tx.insert(marEntries).values({ ...parsed.data, organisationId: m.organisationId, homeId: m.homeId, childId: m.childId, medicationId, administeredBy: user.id });
    if (parsed.data.stockAfter !== null) await tx.update(medications).set({ stockCount: parsed.data.stockAfter, updatedAt: new Date() }).where(eq(medications.id, medicationId));
  });
  await audit({ organisationId: m.organisationId, homeId: m.homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "mar_entry", entityId: medicationId, diff: { after: { outcome: parsed.data.outcome, at: parsed.data.administeredAt } }, ...(await requestMeta()) });
  revalidatePath(`/children/${m.childId}/medication`);
  return { ok: true };
}

// ---- Checks ----
export async function seedDefaultChecks(homeId: string): Promise<void> {
  const h = await home(homeId);
  const user = await requirePermission("home:manage", { organisationId: h.organisationId, homeId });
  const existing = await db.select({ name: checkTypes.name }).from(checkTypes).where(eq(checkTypes.homeId, homeId));
  const have = new Set(existing.map((e) => e.name));
  const missing = DEFAULT_CHECKS.filter((c) => !have.has(c.name));
  if (missing.length) await db.insert(checkTypes).values(missing.map((c) => ({ ...c, organisationId: h.organisationId, homeId })));
  await audit({ organisationId: h.organisationId, homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "check_type", entityId: homeId, diff: { after: { added: missing.map((m) => m.name) } }, ...(await requestMeta()) });
  revalidatePath(`/homes/${homeId}/checks`);
}

export async function recordCheck(checkTypeId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [t] = await db.select().from(checkTypes).where(eq(checkTypes.id, checkTypeId)).limit(1);
  if (!t) return { error: "Not found" };
  const user = await requirePermission("child:write", { organisationId: t.organisationId, homeId: t.homeId });
  const parsed = z.object({ checkedOn: dateStr, passed: z.string().transform((s) => s === "yes"), findings: optText, actionTaken: optText }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: "Check the form" };
  if (!parsed.data.passed && !parsed.data.findings) return { error: "Say what failed" };
  await db.insert(checkResults).values({ ...parsed.data, organisationId: t.organisationId, homeId: t.homeId, checkTypeId, checkedBy: user.id });
  await audit({ organisationId: t.organisationId, homeId: t.homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "check_result", entityId: checkTypeId, diff: { after: parsed.data }, ...(await requestMeta()) });
  revalidatePath(`/homes/${t.homeId}/checks`);
  return { ok: true };
}

export async function addCheckType(homeId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const h = await home(homeId);
  const user = await requirePermission("home:manage", { organisationId: h.organisationId, homeId });
  const parsed = z.object({ name: z.string().trim().min(1), frequencyDays: z.string().transform(Number).pipe(z.number().int().min(1)), regulation: optText }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: "Name and frequency are required" };
  await db.insert(checkTypes).values({ ...parsed.data, organisationId: h.organisationId, homeId });
  await audit({ organisationId: h.organisationId, homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "check_type", entityId: homeId, diff: { after: parsed.data }, ...(await requestMeta()) });
  revalidatePath(`/homes/${homeId}/checks`);
  return { ok: true };
}

// ---- Maintenance ----
export async function addMaintenance(homeId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const h = await home(homeId);
  const user = await requirePermission("child:write", { organisationId: h.organisationId, homeId });
  const parsed = z.object({ reportedOn: dateStr, location: optText, description: z.string().trim().min(1, "Describe the problem"), priority: z.enum(["urgent", "routine"]), safetyRisk: flag }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const [m] = await db.insert(maintenanceItems).values({ ...parsed.data, organisationId: h.organisationId, homeId, reportedBy: user.id }).returning({ id: maintenanceItems.id });
  await audit({ organisationId: h.organisationId, homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "maintenance_item", entityId: m.id, diff: { after: parsed.data }, ...(await requestMeta()) });
  revalidatePath(`/homes/${homeId}/maintenance`);
  return { ok: true };
}

export async function resolveMaintenance(id: string, fd: FormData): Promise<void> {
  const [m] = await db.select().from(maintenanceItems).where(eq(maintenanceItems.id, id)).limit(1);
  if (!m) return;
  const user = await requirePermission("child:write", { organisationId: m.organisationId, homeId: m.homeId });
  const resolution = String(fd.get("resolution") ?? "").trim();
  const status = fd.get("intent") === "progress" ? "in_progress" : "done";
  await db.update(maintenanceItems).set({ status, resolution: resolution || m.resolution, resolvedOn: status === "done" ? new Date() : null }).where(eq(maintenanceItems.id, id));
  await audit({ organisationId: m.organisationId, homeId: m.homeId, actorUserId: user.id, actorRole: user.role, action: "update", entityType: "maintenance_item", entityId: id, diff: { before: { status: m.status }, after: { status, resolution } }, ...(await requestMeta()) });
  revalidatePath(`/homes/${m.homeId}/maintenance`);
}

// ---- Money ----
export async function addMoneyEntry(homeId: string, childId: string | null, _p: ActionState, fd: FormData): Promise<ActionState> {
  const h = await home(homeId);
  const user = await requirePermission("child:write", { organisationId: h.organisationId, homeId });
  const parsed = z.object({ entryOn: dateStr, description: z.string().trim().min(1, "Description is required"), amount: z.string().trim().regex(/^-?\d+(\.\d{1,2})?$/, "Amount like 12.50"), direction: z.enum(["in", "out"]), receiptHeld: flag, witnessedBy: z.string().uuid().optional().or(z.literal("")).transform((s) => s || null) }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const pence = Math.round(Math.abs(Number(parsed.data.amount)) * 100) * (parsed.data.direction === "out" ? -1 : 1);
  if (pence === 0) return { error: "Amount cannot be zero" };
  const [e] = await db.insert(moneyLedger).values({ organisationId: h.organisationId, homeId, childId, entryOn: parsed.data.entryOn, description: parsed.data.description, amountPence: pence, receiptHeld: parsed.data.receiptHeld, recordedBy: user.id, witnessedBy: parsed.data.witnessedBy }).returning({ id: moneyLedger.id });
  await audit({ organisationId: h.organisationId, homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "money_entry", entityId: e.id, diff: { after: { childId, pence, description: parsed.data.description } }, ...(await requestMeta()) });
  revalidatePath(childId ? `/children/${childId}/money` : `/homes/${homeId}/money`);
  return { ok: true };
}

// ---- Home documents ----
export async function addHomeDocument(homeId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const h = await home(homeId);
  const user = await requirePermission("home:manage", { organisationId: h.organisationId, homeId });
  const parsed = z.object({ kind: z.enum(["statement_of_purpose", "childrens_guide", "policy", "risk_assessment_home", "other"]), title: z.string().trim().min(1, "Title is required"), version: z.string().trim().min(1, "Version is required"), effectiveFrom: dateStr, reviewDueOn: optDate, summaryOfChanges: optText, ofstedNotifiedOn: optDate, supersedesId: z.string().uuid().optional().or(z.literal("")).transform((s) => s || null) }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const file = fd.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile && file.size > 10 * 1024 * 1024) return { error: "File is larger than 10 MB" };
  const [d] = await db.insert(homeDocuments).values({
    ...parsed.data, organisationId: h.organisationId, homeId, createdBy: user.id,
    fileName: hasFile ? file.name : null, mimeType: hasFile ? file.type : null, sizeBytes: hasFile ? file.size : null, content: hasFile ? Buffer.from(await file.arrayBuffer()) : null,
  }).returning({ id: homeDocuments.id });
  await audit({ organisationId: h.organisationId, homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "home_document", entityId: d.id, diff: { after: { kind: parsed.data.kind, title: parsed.data.title, version: parsed.data.version } }, ...(await requestMeta()) });
  revalidatePath(`/homes/${homeId}/documents`);
  return { ok: true };
}
