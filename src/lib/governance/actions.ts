"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { followUpTasks, homes, reg44Visits, reg45Reviews, type QualityStandardAssessment } from "@/db/schema";
import { audit } from "@/lib/audit";
import { Forbidden, requirePermission, requireUser } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { canTransition } from "@/lib/records/lifecycle";
import { QUALITY_STANDARDS, splitRecommendations } from "@/lib/rules/governance";
import { homeMetrics, snapshotOf } from "./metrics";
import type { ActionState } from "@/lib/children/actions";

const optText = z.string().optional().transform((s) => (s?.trim() ? s.trim() : null));
const optDate = z.string().optional().transform((s) => (s ? new Date(`${s}T00:00:00Z`) : null));
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").transform((s) => new Date(`${s}T00:00:00Z`));
const flag = z.string().optional().transform((s) => s === "on");
const optInt = z.string().optional().transform((s) => (s ? Number(s) : null));
const tri = z.string().optional().transform((s) => (s === "yes" ? true : s === "no" ? false : null));

async function home(homeId: string) {
  const [h] = await db.select().from(homes).where(eq(homes.id, homeId)).limit(1);
  if (!h) throw new Error("Home not found");
  return h;
}

// ---------------------------------------------------------------------------
// Reg 44
// ---------------------------------------------------------------------------

const reg44Schema = z.object({
  visitedOn: dateStr, announced: flag, childrenPresent: optInt, childrenSpokenTo: optInt, staffSpokenTo: optText, othersConsulted: optText, recordsReviewed: optText,
  safeguardingOpinion: optText, safeguardingEffective: tri, conductOpinion: optText, conductPromotesWellbeing: tri,
  childrensViews: optText, environment: optText, followUpOnPrevious: optText, recommendations: optText, reportIssuedOn: optDate, ofstedCopyOn: optDate,
});

/** Reg 44 visitor (or a manager entering a paper report) creates the visit record. */
export async function createReg44(homeId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const h = await home(homeId);
  const user = await requireUser();
  const scope = { organisationId: h.organisationId, homeId };
  if (!can(user.grants, "reg44:write", scope) && !can(user.grants, "home:manage", scope)) throw new Forbidden("Only the independent person or a manager can record a Reg 44 visit");
  const parsed = reg44Schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const [v] = await db.insert(reg44Visits).values({ ...parsed.data, organisationId: h.organisationId, homeId, visitorUserId: user.id, createdBy: user.id, updatedBy: user.id }).returning({ id: reg44Visits.id });
  await audit({ organisationId: h.organisationId, homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "reg44_visit", entityId: v.id, diff: { after: { visitedOn: parsed.data.visitedOn } }, ...(await requestMeta()) });
  redirect(`/governance/reg44/${v.id}`);
}

export async function updateReg44(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [v] = await db.select().from(reg44Visits).where(eq(reg44Visits.id, id)).limit(1);
  if (!v) return { error: "Not found" };
  const user = await requireUser();
  const ok = canTransition("edit", { grants: user.grants, userId: user.id, organisationId: v.organisationId, homeId: v.homeId, record: { status: v.status, createdBy: v.createdBy } })
    || (v.status === "draft" && v.visitorUserId === user.id && can(user.grants, "reg44:write", { organisationId: v.organisationId, homeId: v.homeId }));
  if (!ok) return { error: "This report can no longer be edited." };
  const parsed = reg44Schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  await db.update(reg44Visits).set({ ...parsed.data, updatedAt: new Date(), updatedBy: user.id }).where(eq(reg44Visits.id, id));
  await audit({ organisationId: v.organisationId, homeId: v.homeId, actorUserId: user.id, actorRole: user.role, action: "update", entityType: "reg44_visit", entityId: id, ...(await requestMeta()) });
  revalidatePath(`/governance/reg44/${id}`);
  return { ok: true };
}

/** The visitor submits their report: status → submitted, and each recommendation becomes a tracked action for the RM. */
export async function submitReg44(id: string): Promise<void> {
  const [v] = await db.select().from(reg44Visits).where(eq(reg44Visits.id, id)).limit(1);
  if (!v || v.status !== "draft") return;
  const user = await requireUser();
  const scope = { organisationId: v.organisationId, homeId: v.homeId };
  if (!(v.visitorUserId === user.id && can(user.grants, "reg44:write", scope)) && !can(user.grants, "record:submit", scope)) throw new Forbidden("Not allowed");
  const recs = splitRecommendations(v.recommendations);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(reg44Visits).set({ status: "submitted", submittedAt: now, submittedBy: user.id, updatedAt: now, updatedBy: user.id }).where(eq(reg44Visits.id, id));
    if (recs.length) {
      await tx.insert(followUpTasks).values(recs.map((r, i) => ({
        organisationId: v.organisationId, homeId: v.homeId, sourceType: "reg44_visit", sourceId: v.id, ruleKey: `reg44.recommendation.${i + 1}`,
        title: r, detail: `Recommendation from the Reg 44 visit on ${v.visitedOn.toLocaleDateString("en-GB")}`, regulation: "Reg 44(5)", ownerRole: "registered_manager" as const,
        dueAt: new Date(now.getTime() + 28 * 86_400_000), createdBy: user.id,
      })));
    }
    // Manager must respond: a task of its own
    await tx.insert(followUpTasks).values({ organisationId: v.organisationId, homeId: v.homeId, sourceType: "reg44_visit", sourceId: v.id, ruleKey: "reg44.manager_response", title: "Registered manager responds to the Reg 44 report", regulation: "Reg 44(6)", ownerRole: "registered_manager", dueAt: new Date(now.getTime() + 14 * 86_400_000), createdBy: user.id });
    if (!v.ofstedCopyOn) {
      await tx.insert(followUpTasks).values({ organisationId: v.organisationId, homeId: v.homeId, sourceType: "reg44_visit", sourceId: v.id, ruleKey: "reg44.ofsted_copy", title: "Copy of the Reg 44 report sent to Ofsted", regulation: "Reg 44(7)(c)", ownerRole: "registered_manager", dueAt: new Date(now.getTime() + 14 * 86_400_000), createdBy: user.id });
    }
  });
  await audit({ ...scope, actorUserId: user.id, actorRole: user.role, action: "submit", entityType: "reg44_visit", entityId: id, diff: { after: { recommendations: recs.length } }, ...(await requestMeta()) });
  revalidatePath(`/governance/reg44/${id}`);
}

export async function respondReg44(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [v] = await db.select().from(reg44Visits).where(eq(reg44Visits.id, id)).limit(1);
  if (!v) return { error: "Not found" };
  const user = await requirePermission("home:manage", { organisationId: v.organisationId, homeId: v.homeId });
  const response = String(fd.get("managerResponse") ?? "").trim();
  if (response.length < 10) return { error: "Write the response" };
  const ofstedCopyOn = fd.get("ofstedCopyOn") ? new Date(`${fd.get("ofstedCopyOn")}T00:00:00Z`) : v.ofstedCopyOn;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(reg44Visits).set({ managerResponse: response, managerRespondedAt: now, managerRespondedBy: user.id, ofstedCopyOn, status: v.status === "submitted" ? "reviewed" : v.status, reviewedAt: v.status === "submitted" ? now : v.reviewedAt, reviewedBy: v.status === "submitted" ? user.id : v.reviewedBy, updatedAt: now, updatedBy: user.id }).where(eq(reg44Visits.id, id));
    const tasks = await tx.select().from(followUpTasks).where(eq(followUpTasks.sourceId, id));
    for (const t of tasks) {
      if (t.status !== "open") continue;
      if (t.ruleKey === "reg44.manager_response" || (t.ruleKey === "reg44.ofsted_copy" && ofstedCopyOn)) {
        await tx.update(followUpTasks).set({ status: "done", completedAt: now, completedBy: user.id, completionNote: "Recorded on the visit" }).where(eq(followUpTasks.id, t.id));
      }
    }
  });
  await audit({ organisationId: v.organisationId, homeId: v.homeId, actorUserId: user.id, actorRole: user.role, action: "review", entityType: "reg44_visit", entityId: id, ...(await requestMeta()) });
  revalidatePath(`/governance/reg44/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reg 45
// ---------------------------------------------------------------------------

export async function createReg45(homeId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const h = await home(homeId);
  const user = await requirePermission("home:manage", { organisationId: h.organisationId, homeId });
  const parsed = z.object({ periodFrom: dateStr, periodTo: dateStr }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success || parsed.data.periodTo <= parsed.data.periodFrom) return { error: "Choose a valid period" };
  const m = await homeMetrics(homeId, parsed.data.periodFrom, parsed.data.periodTo);
  if (!m) return { error: "Home not found" };
  const standards: QualityStandardAssessment[] = QUALITY_STANDARDS.map((q) => ({ regulation: q.regulation, rating: "not_assessed", evidence: "", actions: "" }));
  const [r] = await db.insert(reg45Reviews).values({ ...parsed.data, organisationId: h.organisationId, homeId, dataSnapshot: snapshotOf(m), standards, createdBy: user.id, updatedBy: user.id }).returning({ id: reg45Reviews.id });
  await audit({ organisationId: h.organisationId, homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "reg45_review", entityId: r.id, diff: { after: parsed.data }, ...(await requestMeta()) });
  redirect(`/governance/reg45/${r.id}`);
}

export async function updateReg45(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [r] = await db.select().from(reg45Reviews).where(eq(reg45Reviews.id, id)).limit(1);
  if (!r) return { error: "Not found" };
  const user = await requireUser();
  const ok = canTransition("edit", { grants: user.grants, userId: user.id, organisationId: r.organisationId, homeId: r.homeId, record: { status: r.status, createdBy: r.createdBy } }) && can(user.grants, "home:manage", { organisationId: r.organisationId, homeId: r.homeId });
  if (!ok) return { error: "This review can no longer be edited." };
  const base = z.object({ summary: optText, strengths: optText, areasForImprovement: optText, progressOnPreviousActions: optText, feedbackFromChildren: optText, feedbackFromOthers: optText, ofstedCopyOn: optDate }).safeParse(Object.fromEntries(fd.entries()));
  if (!base.success) return { error: "Check the form" };
  const standards: QualityStandardAssessment[] = QUALITY_STANDARDS.map((q) => ({
    regulation: q.regulation,
    rating: (String(fd.get(`qs${q.regulation}.rating`) ?? "not_assessed") as QualityStandardAssessment["rating"]),
    evidence: String(fd.get(`qs${q.regulation}.evidence`) ?? "").trim(),
    actions: String(fd.get(`qs${q.regulation}.actions`) ?? "").trim(),
  }));
  await db.update(reg45Reviews).set({ ...base.data, standards, updatedAt: new Date(), updatedBy: user.id }).where(eq(reg45Reviews.id, id));
  await audit({ organisationId: r.organisationId, homeId: r.homeId, actorUserId: user.id, actorRole: user.role, action: "update", entityType: "reg45_review", entityId: id, ...(await requestMeta()) });
  revalidatePath(`/governance/reg45/${id}`);
  return { ok: true };
}

export async function refreshReg45Snapshot(id: string): Promise<void> {
  const [r] = await db.select().from(reg45Reviews).where(eq(reg45Reviews.id, id)).limit(1);
  if (!r || r.status === "locked") return;
  const user = await requirePermission("home:manage", { organisationId: r.organisationId, homeId: r.homeId });
  const m = await homeMetrics(r.homeId, r.periodFrom, r.periodTo);
  if (!m) return;
  await db.update(reg45Reviews).set({ dataSnapshot: snapshotOf(m), updatedAt: new Date(), updatedBy: user.id }).where(eq(reg45Reviews.id, id));
  revalidatePath(`/governance/reg45/${id}`);
}

/** Submitting the review turns each standard's actions into tracked actions for the RM. */
export async function submitReg45(id: string): Promise<void> {
  const [r] = await db.select().from(reg45Reviews).where(eq(reg45Reviews.id, id)).limit(1);
  if (!r || r.status !== "draft") return;
  const user = await requirePermission("home:manage", { organisationId: r.organisationId, homeId: r.homeId });
  const now = new Date();
  const actions = r.standards.flatMap((s) => splitRecommendations(s.actions).map((a) => ({ reg: s.regulation, a })));
  await db.transaction(async (tx) => {
    await tx.update(reg45Reviews).set({ status: "submitted", submittedAt: now, submittedBy: user.id, updatedAt: now, updatedBy: user.id }).where(eq(reg45Reviews.id, id));
    if (actions.length) {
      await tx.insert(followUpTasks).values(actions.map(({ reg, a }, i) => ({
        organisationId: r.organisationId, homeId: r.homeId, sourceType: "reg45_review", sourceId: r.id, ruleKey: `reg45.action.${i + 1}`, title: a,
        detail: `From the Reg 45 review ${r.periodFrom.toLocaleDateString("en-GB")}–${r.periodTo.toLocaleDateString("en-GB")}`, regulation: `Reg 45, Reg ${reg}`, ownerRole: "registered_manager" as const,
        dueAt: new Date(now.getTime() + 60 * 86_400_000), createdBy: user.id,
      })));
    }
  });
  await audit({ organisationId: r.organisationId, homeId: r.homeId, actorUserId: user.id, actorRole: user.role, action: "submit", entityType: "reg45_review", entityId: id, diff: { after: { actions: actions.length } }, ...(await requestMeta()) });
  revalidatePath(`/governance/reg45/${id}`);
}

/** RI signs the review (Reg 45 is the registered person's review; the RI sign-off locks it). */
export async function riSignReg45(id: string, fd: FormData): Promise<void> {
  const [r] = await db.select().from(reg45Reviews).where(eq(reg45Reviews.id, id)).limit(1);
  if (!r || r.status === "locked" || r.status === "draft") return;
  const user = await requireUser();
  if (!["responsible_individual", "director"].includes(user.role ?? "") || !can(user.grants, "record:lock", { organisationId: r.organisationId, homeId: r.homeId })) throw new Forbidden("Only the RI or a director can sign off a Reg 45 review");
  const ofstedCopyOn = fd.get("ofstedCopyOn") ? new Date(`${fd.get("ofstedCopyOn")}T00:00:00Z`) : r.ofstedCopyOn;
  const now = new Date();
  await db.update(reg45Reviews).set({ riSignedAt: now, riSignedBy: user.id, ofstedCopyOn, status: "locked", reviewedAt: r.reviewedAt ?? now, reviewedBy: r.reviewedBy ?? user.id, lockedAt: now, lockedBy: user.id, updatedAt: now, updatedBy: user.id }).where(eq(reg45Reviews.id, id));
  await audit({ organisationId: r.organisationId, homeId: r.homeId, actorUserId: user.id, actorRole: user.role, action: "lock", entityType: "reg45_review", entityId: id, diff: { after: { riSigned: true, ofstedCopyOn } }, ...(await requestMeta()) });
  revalidatePath(`/governance/reg45/${id}`);
}
