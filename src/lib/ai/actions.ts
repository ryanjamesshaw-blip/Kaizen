"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { aiDrafts, children, childVoice, chronologyEntries, dailyLogs, followUpTasks, homes, incidents, placements, reg44Visits, reg45Reviews } from "@/db/schema";
import { audit } from "@/lib/audit";
import { Forbidden, requirePermission, requireUser } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/session";
import { ageOn } from "@/lib/children/queries";
import { homeMetrics } from "@/lib/governance/metrics";
import { can } from "@/lib/rbac";
import { scoreInspection } from "@/lib/rules/inspection";
import { complete, hashInput, isConfigured } from "./client";
import { chronologyPrompt, logFeedbackPrompt, mockInspectionPrompt, reg45Prompt, PROMPT_VERSIONS } from "./prompts";
import { LEGAL_LABEL } from "@/components/child-form";
import type { ActionState } from "@/lib/children/actions";

type Target = "reg45_review" | "chronology_summary" | "log_feedback" | "mock_inspection";

async function store(args: { organisationId: string; homeId: string; childId?: string | null; target: Target; targetId: string | null; promptVersion: string; prompt: string; userId: string; role: string | null; wantJson?: boolean; maxTokens?: number }) {
  const res = await complete(args.prompt, { wantJson: args.wantJson, maxTokens: args.maxTokens });
  const [d] = await db.insert(aiDrafts).values({
    organisationId: args.organisationId, homeId: args.homeId, childId: args.childId ?? null, target: args.target, targetId: args.targetId,
    promptVersion: args.promptVersion, model: res.model, inputHash: hashInput(args.prompt), inputTokens: res.inputTokens, outputTokens: res.outputTokens,
    output: res.text, outputJson: res.json, createdBy: args.userId,
  }).returning({ id: aiDrafts.id });
  await audit({ organisationId: args.organisationId, homeId: args.homeId, actorUserId: args.userId, actorRole: args.role as never, action: "create", entityType: "ai_draft", entityId: d.id, diff: { after: { target: args.target, targetId: args.targetId, model: res.model, promptVersion: args.promptVersion } }, ...(await requestMeta()) });
  return d.id;
}

function notConfigured(): ActionState { return { error: "AI drafting is not configured on this installation (ANTHROPIC_API_KEY). Everything else works without it." }; }

async function reg44FindingsFor(homeId: string, from: Date, to: Date) {
  const rows = await db.select().from(reg44Visits).where(and(eq(reg44Visits.homeId, homeId), isNull(reg44Visits.supersedesId))).orderBy(desc(reg44Visits.visitedOn)).limit(8);
  return rows.filter((v) => v.visitedOn >= from && v.visitedOn <= to).map((v) => `${v.visitedOn.toLocaleDateString("en-GB")}: safeguarded ${v.safeguardingEffective === false ? "NO" : v.safeguardingEffective ? "yes" : "not stated"}; wellbeing ${v.conductPromotesWellbeing === false ? "NO" : v.conductPromotesWellbeing ? "yes" : "not stated"}. ${v.recommendations ? `Recommendations: ${v.recommendations.replace(/\s*\n\s*/g, "; ")}` : ""}`);
}

// ---------------------------------------------------------------------------

export async function draftReg45(reviewId: string, _p: ActionState, _fd: FormData): Promise<ActionState> {
  const [r] = await db.select().from(reg45Reviews).where(eq(reg45Reviews.id, reviewId)).limit(1);
  if (!r) return { error: "Not found" };
  const user = await requirePermission("home:manage", { organisationId: r.organisationId, homeId: r.homeId });
  if (!isConfigured()) return notConfigured();
  const [home] = await db.select().from(homes).where(eq(homes.id, r.homeId)).limit(1);
  const m = await homeMetrics(r.homeId, r.periodFrom, r.periodTo);
  if (!m) return { error: "Home not found" };
  const [prev] = await db.select({ summary: reg45Reviews.summary }).from(reg45Reviews).where(and(eq(reg45Reviews.homeId, r.homeId), eq(reg45Reviews.status, "locked"))).orderBy(desc(reg45Reviews.periodTo)).limit(1);
  const prompt = reg45Prompt({ homeName: home.name, metrics: m, standards: r.standards, previousSummary: prev?.summary ?? null, feedbackFromChildren: r.feedbackFromChildren, feedbackFromOthers: r.feedbackFromOthers, reg44Findings: await reg44FindingsFor(r.homeId, r.periodFrom, r.periodTo) });
  await store({ organisationId: r.organisationId, homeId: r.homeId, target: "reg45_review", targetId: r.id, promptVersion: PROMPT_VERSIONS.reg45, prompt, userId: user.id, role: user.role, maxTokens: 3500 });
  revalidatePath(`/governance/reg45/${reviewId}`);
  return { ok: true };
}

export async function draftChronology(childId: string, _p: ActionState, _fd: FormData): Promise<ActionState> {
  const [c] = await db.select().from(children).where(eq(children.id, childId)).limit(1);
  if (!c) return { error: "Not found" };
  const user = await requireUser();
  if (!can(user.grants, "child:write", { organisationId: c.organisationId, homeId: c.homeId })) throw new Forbidden("Not allowed");
  if (!isConfigured()) return notConfigured();
  const [p] = await db.select().from(placements).where(eq(placements.childId, childId)).orderBy(asc(placements.admittedOn)).limit(1);
  const [entries, incs, voice] = await Promise.all([
    db.select().from(chronologyEntries).where(eq(chronologyEntries.childId, childId)).orderBy(asc(chronologyEntries.occurredOn)),
    db.select().from(incidents).where(and(eq(incidents.childId, childId), isNull(incidents.supersedesId))).orderBy(desc(incidents.occurredAt)).limit(30),
    db.select().from(childVoice).where(eq(childVoice.childId, childId)).orderBy(desc(childVoice.recordedOn)).limit(20),
  ]);
  const prompt = chronologyPrompt({ firstName: c.firstName, age: ageOn(c.dateOfBirth), placedSince: p?.admittedOn ?? c.createdAt, legalStatus: LEGAL_LABEL[c.legalStatus], entries: entries.map((e) => ({ on: e.occurredOn, category: e.category, summary: e.summary, detail: e.detail })), incidents: incs.map((i) => ({ at: i.occurredAt, type: i.type, severity: i.severity })), voice: voice.map((v) => ({ on: v.recordedOn, said: v.whatTheChildSaid, outcome: v.outcome })) });
  await store({ organisationId: c.organisationId, homeId: c.homeId, childId, target: "chronology_summary", targetId: childId, promptVersion: PROMPT_VERSIONS.chronology, prompt, userId: user.id, role: user.role });
  revalidatePath(`/children/${childId}`);
  return { ok: true };
}

export async function draftLogFeedback(logId: string, _p: ActionState, _fd: FormData): Promise<ActionState> {
  const [l] = await db.select().from(dailyLogs).where(eq(dailyLogs.id, logId)).limit(1);
  if (!l) return { error: "Not found" };
  const user = await requireUser();
  const scope = { organisationId: l.organisationId, homeId: l.homeId };
  if (!(can(user.grants, "record:review", scope) || (l.createdBy === user.id && can(user.grants, "child:write", scope)))) throw new Forbidden("Not allowed");
  if (!isConfigured()) return notConfigured();
  const [c] = await db.select({ firstName: children.firstName }).from(children).where(eq(children.id, l.childId)).limit(1);
  const prompt = logFeedbackPrompt({ firstName: c.firstName, logDate: l.logDate, shift: l.shift, narrative: l.narrative, positives: l.positives, concerns: l.concerns, prompts: { mood: l.mood, attendedEducation: l.attendedEducation, meals: l.meals, activities: l.activities, contact: l.contactWithFamily, health: l.healthNotes, medicationGiven: l.medicationGiven, bedtime: l.bedtime, sleep: l.sleep } });
  await store({ ...scope, childId: l.childId, target: "log_feedback", targetId: l.id, promptVersion: PROMPT_VERSIONS.logFeedback, prompt, userId: user.id, role: user.role, maxTokens: 900 });
  revalidatePath(`/shift/log/${logId}`);
  return { ok: true };
}

export async function runMockInspection(homeId: string, _p: ActionState, _fd: FormData): Promise<ActionState> {
  const [home] = await db.select().from(homes).where(eq(homes.id, homeId)).limit(1);
  if (!home) return { error: "Not found" };
  const user = await requirePermission("inspection:export", { organisationId: home.organisationId, homeId });
  if (!isConfigured()) return notConfigured();
  const now = new Date(); const from = new Date(now); from.setMonth(from.getMonth() - 12);
  const m = await homeMetrics(homeId, from, now, now);
  if (!m) return { error: "Home not found" };
  const open = await db.select().from(followUpTasks).where(and(eq(followUpTasks.homeId, homeId), eq(followUpTasks.sourceType, "engine"), eq(followUpTasks.status, "open")));
  const counts: Record<string, number> = {}; for (const t of open) counts[t.ruleKey] = (counts[t.ruleKey] ?? 0) + 1;
  const scored = scoreInspection(m, counts);
  const voice = await db.select({ said: childVoice.whatTheChildSaid }).from(childVoice).where(eq(childVoice.homeId, homeId)).orderBy(desc(childVoice.recordedOn)).limit(10);
  const prompt = mockInspectionPrompt({ homeName: home.name, metrics: m, areas: scored.areas, overall: scored.overall, openFindings: open.slice(0, 30).map((t) => ({ rule: t.ruleKey, title: t.title, regulation: t.regulation ?? "" })), reg44Findings: await reg44FindingsFor(homeId, from, now), childVoice: voice.map((v) => v.said) });
  const id = await store({ organisationId: home.organisationId, homeId, target: "mock_inspection", targetId: homeId, promptVersion: PROMPT_VERSIONS.mockInspection, prompt, userId: user.id, role: user.role, wantJson: true, maxTokens: 4000 });
  // Keep the deterministic judgements with the draft so the page never has to recompute them.
  await db.update(aiDrafts).set({ outputJson: { ...(await db.select({ j: aiDrafts.outputJson }).from(aiDrafts).where(eq(aiDrafts.id, id)).then((r) => r[0]?.j ?? {})), judgements: scored } }).where(eq(aiDrafts.id, id));
  revalidatePath(`/homes/${homeId}/mock-inspection`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Human decisions
// ---------------------------------------------------------------------------

export async function decideDraft(draftId: string, fd: FormData): Promise<void> {
  const [d] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, draftId)).limit(1);
  if (!d || d.status !== "draft") return;
  const user = await requireUser();
  const scope = { organisationId: d.organisationId, homeId: d.homeId };
  if (!can(user.grants, "child:write", scope) && !can(user.grants, "home:manage", scope)) throw new Forbidden("Not allowed");
  const decision = fd.get("decision") === "accept" ? "accepted" : "rejected";
  const note = String(fd.get("note") ?? "").trim() || null;
  await db.update(aiDrafts).set({ status: decision, decidedBy: user.id, decidedAt: new Date(), decisionNote: note }).where(eq(aiDrafts.id, draftId));
  await audit({ ...scope, actorUserId: user.id, actorRole: user.role, action: "update", entityType: "ai_draft", entityId: draftId, reason: note, diff: { before: { status: "draft" }, after: { status: decision } }, ...(await requestMeta()) });
  revalidatePath("/");
}

/** Accepting a Reg 45 draft copies its text into the review's summary — still a draft the manager edits and submits themselves. */
export async function acceptReg45Draft(draftId: string): Promise<void> {
  const [d] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, draftId)).limit(1);
  if (!d || d.target !== "reg45_review" || !d.targetId) return;
  const user = await requirePermission("home:manage", { organisationId: d.organisationId, homeId: d.homeId });
  const [r] = await db.select().from(reg45Reviews).where(eq(reg45Reviews.id, d.targetId)).limit(1);
  if (!r || r.status !== "draft") return;
  const merged = r.summary ? `${r.summary}\n\n--- AI draft ${new Date().toLocaleDateString("en-GB")} ---\n${d.output}` : d.output;
  await db.update(reg45Reviews).set({ summary: merged, updatedAt: new Date(), updatedBy: user.id }).where(eq(reg45Reviews.id, r.id));
  await db.update(aiDrafts).set({ status: "accepted", decidedBy: user.id, decidedAt: new Date(), decisionNote: "Inserted into review summary" }).where(eq(aiDrafts.id, draftId));
  await audit({ organisationId: d.organisationId, homeId: d.homeId, actorUserId: user.id, actorRole: user.role, action: "update", entityType: "reg45_review", entityId: r.id, diff: { after: { summaryFromAiDraft: draftId } }, ...(await requestMeta()) });
  revalidatePath(`/governance/reg45/${r.id}`);
}

/** The manager chooses to turn the mock inspection's action plan into tracked actions. */
export async function createActionsFromDraft(draftId: string): Promise<void> {
  const [d] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, draftId)).limit(1);
  if (!d || d.target !== "mock_inspection") return;
  const user = await requirePermission("home:manage", { organisationId: d.organisationId, homeId: d.homeId });
  const actions = ((d.outputJson?.actions as Array<{ title: string; owner: string; dueDays: number; regulation: string }> | undefined) ?? []).filter((a) => a.title);
  if (!actions.length) return;
  const roles = new Set(["care_worker", "deputy", "registered_manager", "responsible_individual"]);
  await db.insert(followUpTasks).values(actions.map((a, i) => ({
    organisationId: d.organisationId, homeId: d.homeId, sourceType: "mock_inspection", sourceId: d.id, ruleKey: `mock_inspection.action.${i + 1}`, title: a.title,
    detail: `From the mock inspection of ${d.createdAt.toLocaleDateString("en-GB")} (accepted by ${user.fullName})`, regulation: a.regulation || null,
    ownerRole: (roles.has(a.owner) ? a.owner : "registered_manager") as never, dueAt: new Date(Date.now() + Math.max(1, Number(a.dueDays) || 14) * 86_400_000), createdBy: user.id,
  })));
  await db.update(aiDrafts).set({ status: "accepted", decidedBy: user.id, decidedAt: new Date(), decisionNote: `${actions.length} actions created` }).where(eq(aiDrafts.id, draftId));
  await audit({ organisationId: d.organisationId, homeId: d.homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "follow_up_task", entityId: d.id, diff: { after: { fromMockInspection: actions.length } }, ...(await requestMeta()) });
  revalidatePath(`/homes/${d.homeId}/mock-inspection`); revalidatePath("/tasks");
}
