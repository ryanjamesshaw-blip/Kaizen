"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { children, childVoice, chronologyEntries, followUpTasks, homes, incidents, missingEpisodes, notifications, physicalInterventions, incidentTypeEnum, notificationRecipientEnum } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requirePermission, requireUser } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/session";
import { canTransition } from "@/lib/records/lifecycle";
import { dueDate, tasksFor } from "@/lib/rules/incidents";
import type { ActionState } from "@/lib/children/actions";

const optText = z.string().optional().transform((s) => (s?.trim() ? s.trim() : null));
const dt = z.string().min(1, "Date and time are required").transform((s) => new Date(s));
const optDt = z.string().optional().transform((s) => (s ? new Date(s) : null));
const flag = z.string().optional().transform((s) => s === "on");

const incidentSchema = z.object({
  homeId: z.string().uuid(),
  childId: z.string().uuid().optional().or(z.literal("")).transform((s) => s || null),
  type: z.enum(incidentTypeEnum.enumValues),
  severity: z.enum(["low", "medium", "high", "critical"]),
  occurredAt: dt,
  location: optText,
  staffInvolved: optText,
  witnesses: optText,
  antecedent: optText,
  narrative: z.string().trim().min(20, "Describe what happened — at least a couple of sentences"),
  immediateActions: optText,
  injuries: optText,
  notifyOfsted: flag,
  notifyPlacingAuthority: flag,
  notifyPolice: flag,
  notifyLado: flag,
});

const piSchema = z.object({
  holdType: z.string().trim().min(1, "Name the hold or measure used"),
  startedAt: dt,
  durationMinutes: z.string().transform(Number).pipe(z.number().int().min(0).max(240)),
  staffApplying: z.string().trim().min(1, "Who applied the measure?"),
  deEscalationAttempted: z.string().trim().min(10, "Record what was tried before the hold"),
  justification: z.string().trim().min(10, "Why was it necessary? Risk of serious harm to whom?"),
  injuriesChild: optText,
  injuriesStaff: optText,
  medicalAttention: optText,
  effectiveness: optText,
});

const missingSchema = z.object({
  leftAt: dt,
  circumstances: optText,
  classification: z.enum(["missing", "absent"]),
  policeInformedAt: optDt,
  policeReference: optText,
});

export async function createIncident(_p: ActionState, fd: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(fd.entries());
  const parsed = incidentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const d = parsed.data;
  const [home] = await db.select().from(homes).where(eq(homes.id, d.homeId)).limit(1);
  if (!home) return { error: "Home not found" };
  const user = await requirePermission("child:write", { organisationId: home.organisationId, homeId: home.id });
  let child = null;
  if (d.childId) {
    [child] = await db.select().from(children).where(eq(children.id, d.childId)).limit(1);
    if (!child || child.homeId !== home.id) return { error: "Child is not placed in this home" };
  }
  if ((d.type === "physical_intervention" || d.type === "missing") && !child) return { error: "This type of incident must be about a child" };

  let pi: z.infer<typeof piSchema> | null = null;
  let missing: z.infer<typeof missingSchema> | null = null;
  if (d.type === "physical_intervention") {
    const p = piSchema.safeParse(raw);
    if (!p.success) return { error: p.error.issues[0]?.message ?? "Complete the restraint record" };
    pi = p.data;
  }
  if (d.type === "missing") {
    const m = missingSchema.safeParse(raw);
    if (!m.success) return { error: m.error.issues[0]?.message ?? "Complete the missing details" };
    missing = m.data;
  }

  const facts = {
    type: d.type, severity: d.severity, occurredAt: d.occurredAt,
    injuries: !!(d.injuries || pi?.injuriesChild || pi?.injuriesStaff),
    policeInvolved: d.type === "police_involvement" || !!missing?.policeInformedAt,
    childId: child?.id ?? null,
  };
  const specs = tasksFor(facts);
  const meta = await requestMeta();

  const id = await db.transaction(async (tx) => {
    const [inc] = await tx
      .insert(incidents)
      .values({ ...d, organisationId: home.organisationId, childId: child?.id ?? null, status: "submitted", submittedAt: new Date(), submittedBy: user.id, createdBy: user.id, updatedBy: user.id })
      .returning({ id: incidents.id });
    if (pi && child) {
      await tx.insert(physicalInterventions).values({ ...pi, organisationId: home.organisationId, homeId: home.id, incidentId: inc.id, childId: child.id });
    }
    if (missing && child) {
      await tx.insert(missingEpisodes).values({ ...missing, organisationId: home.organisationId, homeId: home.id, incidentId: inc.id, childId: child.id });
    }
    if (specs.length) {
      await tx.insert(followUpTasks).values(
        specs.map((s) => ({
          organisationId: home.organisationId, homeId: home.id, childId: child?.id ?? null, incidentId: inc.id,
          ruleKey: s.key, title: s.title, detail: s.detail ?? null, regulation: s.regulation, ownerRole: s.ownerRole,
          dueAt: dueDate(d.occurredAt, s.dueHours), createdBy: user.id,
        })),
      );
    }
    if (child) {
      const label: Record<string, string> = { missing: "Missing episode", physical_intervention: "Physical intervention", safeguarding: "Safeguarding concern", complaint: "Complaint", accident: "Accident", medication_error: "Medication error", police_involvement: "Police involvement", allegation_against_staff: "Allegation against staff", property_damage: "Property damage", incident: "Incident" };
      await tx.insert(chronologyEntries).values({
        organisationId: home.organisationId, homeId: home.id, childId: child.id,
        occurredOn: new Date(d.occurredAt.toISOString().slice(0, 10) + "T00:00:00Z"),
        category: d.type === "missing" ? "missing" : ["safeguarding", "allegation_against_staff"].includes(d.type) ? "safeguarding" : "incident",
        summary: `${label[d.type]} (${d.severity})`, detail: d.narrative.slice(0, 200), significant: d.severity !== "low",
        sourceType: "incident", sourceId: inc.id, createdBy: user.id,
      });
    }
    return inc.id;
  });

  await audit({
    organisationId: home.organisationId, homeId: home.id, actorUserId: user.id, actorRole: user.role,
    action: "submit", entityType: "incident", entityId: id,
    diff: { after: { type: d.type, severity: d.severity, occurredAt: d.occurredAt, child: child?.id ?? null, tasksCreated: specs.map((s) => s.key) } }, ...meta,
  });
  redirect(`/incidents/${id}`);
}

/** Manager adds review notes / lessons learned and can override notification flags, before locking. */
export async function updateIncidentReview(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [inc] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  if (!inc) return { error: "Not found" };
  const user = await requirePermission("record:review", { organisationId: inc.organisationId, homeId: inc.homeId });
  if (inc.status === "locked") return { error: "Locked records are amended as a new version" };
  const parsed = z.object({ managerReviewNotes: optText, lessonsLearned: optText, notifyOfsted: flag, notifyPlacingAuthority: flag, notifyPolice: flag, notifyLado: flag }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: "Check the form" };
  await db.update(incidents).set({ ...parsed.data, updatedAt: new Date(), updatedBy: user.id }).where(eq(incidents.id, id));
  await audit({ organisationId: inc.organisationId, homeId: inc.homeId, actorUserId: user.id, actorRole: user.role, action: "update", entityType: "incident", entityId: id, diff: { after: parsed.data }, ...(await requestMeta()) });
  revalidatePath(`/incidents/${id}`);
  return { ok: true };
}

/** Author can correct a submitted (not yet reviewed/locked) incident narrative. */
export async function updateIncidentNarrative(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [inc] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  if (!inc) return { error: "Not found" };
  const user = await requireUser();
  const canEdit = inc.status === "draft"
    ? canTransition("edit", { grants: user.grants, userId: user.id, organisationId: inc.organisationId, homeId: inc.homeId, record: { status: inc.status, createdBy: inc.createdBy } })
    : false;
  if (!canEdit) return { error: "Only a returned draft can be edited. Ask a manager to return it, or amend after locking." };
  const parsed = z.object({ narrative: z.string().trim().min(20), antecedent: optText, immediateActions: optText, injuries: optText, location: optText, staffInvolved: optText, witnesses: optText }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  await db.update(incidents).set({ ...parsed.data, status: "submitted", submittedAt: new Date(), submittedBy: user.id, updatedAt: new Date(), updatedBy: user.id }).where(eq(incidents.id, id));
  await audit({ organisationId: inc.organisationId, homeId: inc.homeId, actorUserId: user.id, actorRole: user.role, action: "submit", entityType: "incident", entityId: id, diff: { before: { narrative: inc.narrative }, after: { narrative: parsed.data.narrative } }, ...(await requestMeta()) });
  revalidatePath(`/incidents/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reg 35 record completion
// ---------------------------------------------------------------------------

export async function recordPiChildsView(piId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [pi] = await db.select().from(physicalInterventions).where(eq(physicalInterventions.id, piId)).limit(1);
  if (!pi) return { error: "Not found" };
  const user = await requirePermission("child:write", { organisationId: pi.organisationId, homeId: pi.homeId });
  const view = String(fd.get("childsView") ?? "").trim();
  if (!view) return { error: "Record the child's view, or that they declined to give one" };
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(physicalInterventions).set({ childsView: view, childsViewRecordedAt: now, childsViewRecordedBy: user.id, updatedAt: now }).where(eq(physicalInterventions.id, piId));
    await tx.insert(childVoice).values({ organisationId: pi.organisationId, homeId: pi.homeId, childId: pi.childId, recordedOn: now, method: "conversation", whatTheChildSaid: view, response: "Recorded on the Reg 35 restraint record", createdBy: user.id });
    await completeRuleTasks(tx, pi.incidentId, ["pi.childs_view", "incident.childs_view"], user.id, "Recorded on Reg 35 record");
  });
  await audit({ organisationId: pi.organisationId, homeId: pi.homeId, actorUserId: user.id, actorRole: user.role, action: "update", entityType: "physical_intervention", entityId: piId, diff: { after: { childsView: view } }, ...(await requestMeta()) });
  revalidatePath(`/incidents/${pi.incidentId}`);
  return { ok: true };
}

export async function recordPiDebrief(piId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [pi] = await db.select().from(physicalInterventions).where(eq(physicalInterventions.id, piId)).limit(1);
  if (!pi) return { error: "Not found" };
  const user = await requirePermission("record:review", { organisationId: pi.organisationId, homeId: pi.homeId });
  const notes = String(fd.get("staffDebriefNotes") ?? "").trim();
  if (notes.length < 10) return { error: "Record the debrief" };
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(physicalInterventions).set({ staffDebriefNotes: notes, staffDebriefAt: now, updatedAt: now }).where(eq(physicalInterventions.id, piId));
    await completeRuleTasks(tx, pi.incidentId, ["pi.staff_debrief"], user.id, "Debrief recorded");
  });
  await audit({ organisationId: pi.organisationId, homeId: pi.homeId, actorUserId: user.id, actorRole: user.role, action: "update", entityType: "physical_intervention", entityId: piId, diff: { after: { staffDebrief: true } }, ...(await requestMeta()) });
  revalidatePath(`/incidents/${pi.incidentId}`);
  return { ok: true };
}

export async function signPiRecord(piId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [pi] = await db.select().from(physicalInterventions).where(eq(physicalInterventions.id, piId)).limit(1);
  if (!pi) return { error: "Not found" };
  const user = await requirePermission("record:lock", { organisationId: pi.organisationId, homeId: pi.homeId });
  if (!pi.childsViewRecordedAt) return { error: "The child's view must be recorded before the manager signs (Reg 35(3))" };
  const comments = String(fd.get("managerComments") ?? "").trim();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(physicalInterventions).set({ managerComments: comments || null, managerSignedAt: now, managerSignedBy: user.id, updatedAt: now }).where(eq(physicalInterventions.id, piId));
    await completeRuleTasks(tx, pi.incidentId, ["pi.manager_sign"], user.id, "Signed");
  });
  await audit({ organisationId: pi.organisationId, homeId: pi.homeId, actorUserId: user.id, actorRole: user.role, action: "review", entityType: "physical_intervention", entityId: piId, diff: { after: { managerSigned: true } }, ...(await requestMeta()) });
  revalidatePath(`/incidents/${pi.incidentId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Missing episode progression
// ---------------------------------------------------------------------------

export async function updateMissing(meId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [me] = await db.select().from(missingEpisodes).where(eq(missingEpisodes.id, meId)).limit(1);
  if (!me) return { error: "Not found" };
  const user = await requirePermission("child:write", { organisationId: me.organisationId, homeId: me.homeId });
  const parsed = z.object({
    policeInformedAt: optDt, policeReference: optText, returnedAt: optDt, returnedHow: optText, conditionOnReturn: optText,
    returnConversationAt: optDt, returnConversationNotes: optText, independentInterviewOfferedAt: optDt, independentInterviewAt: optDt, independentInterviewBy: optText,
  }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: "Check the form" };
  const d = parsed.data;
  await db.transaction(async (tx) => {
    await tx.update(missingEpisodes).set({ ...d, updatedAt: new Date() }).where(eq(missingEpisodes.id, meId));
    const done: string[] = [];
    if (d.policeInformedAt) done.push("missing.police");
    if (d.returnConversationAt) done.push("missing.return_conversation");
    if (d.independentInterviewOfferedAt || d.independentInterviewAt) done.push("missing.independent_interview");
    if (done.length) await completeRuleTasks(tx, me.incidentId, done, user.id, "Recorded on missing episode");
  });
  await audit({ organisationId: me.organisationId, homeId: me.homeId, actorUserId: user.id, actorRole: user.role, action: "update", entityType: "missing_episode", entityId: meId, diff: { after: d }, ...(await requestMeta()) });
  revalidatePath(`/incidents/${me.incidentId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Notifications and tasks
// ---------------------------------------------------------------------------

const RECIPIENT_TASKS: Record<string, string[]> = {
  ofsted: ["missing.ofsted", "safeguarding.ofsted", "police.ofsted", "accident.ofsted"],
  placing_authority: ["incident.placing_authority", "safeguarding.referral"],
  police: ["missing.police"],
  lado: ["allegation.lado"],
  ri: ["allegation.ri", "incident.ri_informed"],
};

export async function recordNotification(incidentId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [inc] = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
  if (!inc) return { error: "Not found" };
  const user = await requirePermission("child:write", { organisationId: inc.organisationId, homeId: inc.homeId });
  const parsed = z.object({ recipient: z.enum(notificationRecipientEnum.enumValues), sentAt: dt, method: optText, reference: optText, notes: optText }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  await db.transaction(async (tx) => {
    const [n] = await tx.insert(notifications).values({ ...parsed.data, organisationId: inc.organisationId, homeId: inc.homeId, incidentId, childId: inc.childId, sentBy: user.id }).returning({ id: notifications.id });
    const keys = RECIPIENT_TASKS[parsed.data.recipient] ?? [];
    if (keys.length) await completeRuleTasks(tx, incidentId, keys, user.id, `Notification sent (${parsed.data.reference ?? "no ref"})`);
    await audit({ organisationId: inc.organisationId, homeId: inc.homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "notification", entityId: n.id, diff: { after: parsed.data }, ...(await requestMeta()) });
  });
  revalidatePath(`/incidents/${incidentId}`);
  return { ok: true };
}

export async function completeTask(taskId: string, fd: FormData): Promise<void> {
  const [t] = await db.select().from(followUpTasks).where(eq(followUpTasks.id, taskId)).limit(1);
  if (!t || t.status !== "open") return;
  const user = await requirePermission("child:write", { organisationId: t.organisationId, homeId: t.homeId });
  const note = String(fd.get("note") ?? "").trim();
  const na = fd.get("intent") === "na";
  if (na && !note) throw new Error("Say why this does not apply");
  if (na && !["deputy", "registered_manager", "responsible_individual", "director"].includes(user.role ?? "")) throw new Error("Only a senior can mark a task not applicable");
  await db.update(followUpTasks).set({ status: na ? "not_applicable" : "done", completedAt: new Date(), completedBy: user.id, completionNote: note || null }).where(eq(followUpTasks.id, taskId));
  await audit({ organisationId: t.organisationId, homeId: t.homeId, actorUserId: user.id, actorRole: user.role, action: "update", entityType: "follow_up_task", entityId: taskId, reason: note || null, diff: { before: { status: "open" }, after: { status: na ? "not_applicable" : "done", ruleKey: t.ruleKey } }, ...(await requestMeta()) });
  revalidatePath("/tasks");
  if (t.incidentId) revalidatePath(`/incidents/${t.incidentId}`);
}

export async function addManualTask(incidentId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [inc] = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
  if (!inc) return { error: "Not found" };
  const user = await requirePermission("record:review", { organisationId: inc.organisationId, homeId: inc.homeId });
  const parsed = z.object({ title: z.string().trim().min(1, "Title is required"), dueAt: dt, ownerRole: z.enum(["care_worker", "deputy", "registered_manager"]) }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const [t] = await db.insert(followUpTasks).values({ ...parsed.data, organisationId: inc.organisationId, homeId: inc.homeId, childId: inc.childId, incidentId, ruleKey: "manual", createdBy: user.id }).returning({ id: followUpTasks.id });
  await audit({ organisationId: inc.organisationId, homeId: inc.homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "follow_up_task", entityId: t.id, diff: { after: parsed.data }, ...(await requestMeta()) });
  revalidatePath(`/incidents/${incidentId}`);
  return { ok: true };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function completeRuleTasks(tx: Tx, incidentId: string, ruleKeys: string[], userId: string, note: string) {
  const open = await tx.select().from(followUpTasks).where(eq(followUpTasks.incidentId, incidentId));
  for (const t of open) {
    if (t.status === "open" && ruleKeys.includes(t.ruleKey)) {
      await tx.update(followUpTasks).set({ status: "done", completedAt: new Date(), completedBy: userId, completionNote: note }).where(eq(followUpTasks.id, t.id));
    }
  }
}

