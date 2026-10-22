"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { childVoice, children, dailyLogs, handovers, homes, keyworkSessions } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requirePermission, requireUser } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/session";
import { canTransition } from "@/lib/records/lifecycle";
import type { ActionState } from "@/lib/children/actions";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").transform((s) => new Date(`${s}T00:00:00Z`));
const optDate = z.string().optional().transform((s) => (s ? new Date(`${s}T00:00:00Z`) : null));
const optText = z.string().optional().transform((s) => (s?.trim() ? s.trim() : null));
const tri = z.string().optional().transform((s) => (s === "yes" ? true : s === "no" ? false : null));

function diffOf(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {}; const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) { b[k] = before[k]; a[k] = after[k]; }
  return { before: b, after: a };
}

async function loadChild(childId: string) {
  const [c] = await db.select().from(children).where(eq(children.id, childId)).limit(1);
  return c ?? null;
}

// ---------------------------------------------------------------------------
// Daily logs
// ---------------------------------------------------------------------------

const logSchema = z.object({
  logDate: dateStr,
  shift: z.enum(["early", "late", "night", "day"]),
  mood: z.enum(["settled", "happy", "anxious", "low", "angry", "mixed", "not_seen"]),
  attendedEducation: tri,
  educationNotes: optText,
  meals: optText,
  activities: optText,
  contactWithFamily: optText,
  healthNotes: optText,
  medicationGiven: tri,
  bedtime: optText,
  sleep: optText,
  narrative: z.string().trim().min(10, "Write at least a sentence about the shift"),
  positives: optText,
  concerns: optText,
});

export async function createDailyLog(childId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const child = await loadChild(childId);
  if (!child || child.archivedAt) return { error: "Child not found" };
  const user = await requirePermission("child:write", { organisationId: child.organisationId, homeId: child.homeId });
  const parsed = logSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const submit = fd.get("intent") === "submit";
  const now = new Date();
  const [l] = await db
    .insert(dailyLogs)
    .values({
      ...parsed.data, organisationId: child.organisationId, homeId: child.homeId, childId,
      status: submit ? "submitted" : "draft", submittedAt: submit ? now : null, submittedBy: submit ? user.id : null,
      createdBy: user.id, updatedBy: user.id,
    })
    .returning({ id: dailyLogs.id });
  await audit({
    organisationId: child.organisationId, homeId: child.homeId, actorUserId: user.id, actorRole: user.role,
    action: submit ? "submit" : "create", entityType: "daily_log", entityId: l.id,
    diff: { after: { logDate: parsed.data.logDate, shift: parsed.data.shift, mood: parsed.data.mood } }, ...(await requestMeta()),
  });
  redirect(`/shift?home=${child.homeId}&date=${parsed.data.logDate.toISOString().slice(0, 10)}`);
}

export async function updateDailyLog(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [existing] = await db.select().from(dailyLogs).where(eq(dailyLogs.id, id)).limit(1);
  if (!existing) return { error: "Not found" };
  const user = await requireUser();
  const ok = canTransition("edit", { grants: user.grants, userId: user.id, organisationId: existing.organisationId, homeId: existing.homeId, record: { status: existing.status, createdBy: existing.createdBy } });
  if (!ok) return { error: "This log can no longer be edited." };
  const parsed = logSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const submit = fd.get("intent") === "submit";
  const now = new Date();
  await db.update(dailyLogs).set({
    ...parsed.data, updatedAt: now, updatedBy: user.id,
    ...(submit ? { status: "submitted" as const, submittedAt: now, submittedBy: user.id } : {}),
  }).where(eq(dailyLogs.id, id));
  await audit({
    organisationId: existing.organisationId, homeId: existing.homeId, actorUserId: user.id, actorRole: user.role,
    action: submit ? "submit" : "update", entityType: "daily_log", entityId: id,
    diff: diffOf(existing as unknown as Record<string, unknown>, parsed.data), ...(await requestMeta()),
  });
  redirect(`/shift?home=${existing.homeId}&date=${parsed.data.logDate.toISOString().slice(0, 10)}`);
}

// ---------------------------------------------------------------------------
// Handover
// ---------------------------------------------------------------------------

export async function saveHandover(homeId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [home] = await db.select().from(homes).where(eq(homes.id, homeId)).limit(1);
  if (!home) return { error: "Home not found" };
  const user = await requirePermission("child:write", { organisationId: home.organisationId, homeId });
  const parsed = z
    .object({
      handoverDate: dateStr,
      fromShift: z.enum(["early", "late", "night", "day"]),
      toShift: z.enum(["early", "late", "night", "day"]),
      homeNotes: optText,
      tasksCarriedForward: optText,
      staffOnDuty: optText,
    })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const childNotes: Array<{ childId: string; note: string }> = [];
  for (const [k, v] of fd.entries()) {
    const m = /^note:([0-9a-f-]{36})$/.exec(k);
    if (m && typeof v === "string" && v.trim()) childNotes.push({ childId: m[1], note: v.trim() });
  }
  const [h] = await db
    .insert(handovers)
    .values({ ...parsed.data, childNotes, organisationId: home.organisationId, homeId, createdBy: user.id, updatedBy: user.id })
    .returning({ id: handovers.id });
  await audit({
    organisationId: home.organisationId, homeId, actorUserId: user.id, actorRole: user.role,
    action: "create", entityType: "handover", entityId: h.id, diff: { after: { date: parsed.data.handoverDate, from: parsed.data.fromShift, to: parsed.data.toShift } }, ...(await requestMeta()),
  });
  redirect(`/shift?home=${homeId}&date=${parsed.data.handoverDate.toISOString().slice(0, 10)}`);
}

export async function receiveHandover(handoverId: string): Promise<void> {
  const [h] = await db.select().from(handovers).where(eq(handovers.id, handoverId)).limit(1);
  if (!h || h.receivedAt) return;
  const user = await requirePermission("child:write", { organisationId: h.organisationId, homeId: h.homeId });
  await db.update(handovers).set({ receivedBy: user.id, receivedAt: new Date() }).where(eq(handovers.id, handoverId));
  await audit({ organisationId: h.organisationId, homeId: h.homeId, actorUserId: user.id, actorRole: user.role, action: "update", entityType: "handover", entityId: handoverId, diff: { after: { received: true } }, ...(await requestMeta()) });
  revalidatePath("/shift");
}

// ---------------------------------------------------------------------------
// Key-work
// ---------------------------------------------------------------------------

const keyworkSchema = z.object({
  sessionDate: dateStr,
  durationMinutes: z.string().optional().transform((s) => (s ? Number(s) : null)),
  topics: z.string().trim().min(1, "What was the session about?"),
  discussion: z.string().trim().min(10, "Record the discussion"),
  childsWords: optText,
  actionsAgreed: optText,
  nextSessionOn: optDate,
});

export async function createKeywork(childId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const child = await loadChild(childId);
  if (!child || child.archivedAt) return { error: "Child not found" };
  const user = await requirePermission("child:write", { organisationId: child.organisationId, homeId: child.homeId });
  const parsed = keyworkSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const submit = fd.get("intent") === "submit";
  const now = new Date();
  const [k] = await db
    .insert(keyworkSessions)
    .values({ ...parsed.data, organisationId: child.organisationId, homeId: child.homeId, childId, status: submit ? "submitted" : "draft", submittedAt: submit ? now : null, submittedBy: submit ? user.id : null, createdBy: user.id, updatedBy: user.id })
    .returning({ id: keyworkSessions.id });
  // A session where the child said something worth keeping is also a voice record.
  if (parsed.data.childsWords) {
    await db.insert(childVoice).values({ organisationId: child.organisationId, homeId: child.homeId, childId, recordedOn: parsed.data.sessionDate, method: "keywork", whatTheChildSaid: parsed.data.childsWords, response: parsed.data.actionsAgreed, createdBy: user.id });
  }
  await audit({ organisationId: child.organisationId, homeId: child.homeId, actorUserId: user.id, actorRole: user.role, action: submit ? "submit" : "create", entityType: "keywork_session", entityId: k.id, diff: { after: { sessionDate: parsed.data.sessionDate, topics: parsed.data.topics } }, ...(await requestMeta()) });
  redirect(`/children/${childId}/daily`);
}

export async function updateKeywork(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [existing] = await db.select().from(keyworkSessions).where(eq(keyworkSessions.id, id)).limit(1);
  if (!existing) return { error: "Not found" };
  const user = await requireUser();
  const ok = canTransition("edit", { grants: user.grants, userId: user.id, organisationId: existing.organisationId, homeId: existing.homeId, record: { status: existing.status, createdBy: existing.createdBy } });
  if (!ok) return { error: "This session can no longer be edited." };
  const parsed = keyworkSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const submit = fd.get("intent") === "submit";
  const now = new Date();
  await db.update(keyworkSessions).set({ ...parsed.data, updatedAt: now, updatedBy: user.id, ...(submit ? { status: "submitted" as const, submittedAt: now, submittedBy: user.id } : {}) }).where(eq(keyworkSessions.id, id));
  await audit({ organisationId: existing.organisationId, homeId: existing.homeId, actorUserId: user.id, actorRole: user.role, action: submit ? "submit" : "update", entityType: "keywork_session", entityId: id, diff: diffOf(existing as unknown as Record<string, unknown>, parsed.data), ...(await requestMeta()) });
  redirect(`/children/${existing.childId}/daily`);
}

// ---------------------------------------------------------------------------
// Child's voice
// ---------------------------------------------------------------------------

export async function addChildVoice(childId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const child = await loadChild(childId);
  if (!child || child.archivedAt) return { error: "Child not found" };
  const user = await requirePermission("child:write", { organisationId: child.organisationId, homeId: child.homeId });
  const parsed = z
    .object({
      recordedOn: dateStr,
      method: z.enum(["conversation", "keywork", "house_meeting", "written", "advocate", "complaint", "survey", "other"]),
      whatTheChildSaid: z.string().trim().min(1, "Record what the child said"),
      response: optText,
    })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const [v] = await db.insert(childVoice).values({ ...parsed.data, organisationId: child.organisationId, homeId: child.homeId, childId, createdBy: user.id }).returning({ id: childVoice.id });
  await audit({ organisationId: child.organisationId, homeId: child.homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "child_voice", entityId: v.id, ...(await requestMeta()) });
  revalidatePath(`/children/${childId}/daily`);
  return { ok: true };
}

export async function respondToVoice(voiceId: string, fd: FormData): Promise<void> {
  const [v] = await db.select().from(childVoice).where(eq(childVoice.id, voiceId)).limit(1);
  if (!v) return;
  const user = await requirePermission("child:write", { organisationId: v.organisationId, homeId: v.homeId });
  const outcome = String(fd.get("outcome") ?? "").trim();
  if (!outcome) return;
  await db.update(childVoice).set({ outcome, respondedBy: user.id, respondedAt: new Date() }).where(eq(childVoice.id, voiceId));
  await audit({ organisationId: v.organisationId, homeId: v.homeId, actorUserId: user.id, actorRole: user.role, action: "update", entityType: "child_voice", entityId: voiceId, diff: { after: { outcome } }, ...(await requestMeta()) });
  revalidatePath(`/children/${v.childId}/daily`);
}
