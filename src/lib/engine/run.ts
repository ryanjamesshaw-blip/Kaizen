import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { followUpTasks, homes, ruleRuns } from "@/db/schema";
import { audit } from "@/lib/audit";
import { complianceScore, reconcile, RULES, type Finding } from "@/lib/rules/engine";
import { DETECTORS } from "./detectors";

export type RunResult = { homeId: string; score: number; summary: Record<string, { findings: number; created: number; resolved: number; escalated: number }>; durationMs: number };

/** Run every rule for one home and reconcile the task list. Safe to run repeatedly. */
export async function runEngineForHome(homeId: string, triggeredBy: string | null, now = new Date()): Promise<RunResult> {
  const started = Date.now();
  const [home] = await db.select().from(homes).where(eq(homes.id, homeId)).limit(1);
  if (!home) throw new Error("Home not found");
  const existing = await db.select().from(followUpTasks).where(and(eq(followUpTasks.homeId, homeId), eq(followUpTasks.sourceType, "engine")));
  const summary: RunResult["summary"] = {};
  const counts: Record<string, number> = {};

  for (const rule of RULES) {
    const detect = DETECTORS[rule.key];
    if (!detect) continue;
    let findings: Finding[] = [];
    try { findings = await detect(homeId, home.organisationId, now); } catch (e) { console.error(`rule ${rule.key} failed`, e); continue; }
    counts[rule.key] = findings.length;
    const r = reconcile(rule, findings, existing.map((t) => ({ id: t.id, ruleKey: t.ruleKey, subjectKey: t.subjectKey, status: t.status, dueAt: t.dueAt, escalatedAt: t.escalatedAt })), now);

    if (r.create.length) {
      await db.insert(followUpTasks).values(r.create.map((f) => ({
        organisationId: home.organisationId, homeId, childId: f.childId ?? null, sourceType: "engine", subjectKey: f.subjectKey, ruleKey: rule.key,
        title: f.title, detail: f.detail ?? null, regulation: rule.regulation, ownerRole: f.ownerRole ?? rule.ownerRole, ownerUserId: f.ownerUserId ?? null, dueAt: f.dueAt, createdBy: triggeredBy,
      })));
    }
    if (r.resolve.length) {
      await db.update(followUpTasks).set({ status: "done", completedAt: now, completedBy: triggeredBy, completionNote: "Resolved — the condition is no longer present" }).where(inArray(followUpTasks.id, r.resolve));
    }
    for (const e of r.escalate) {
      const [t] = existing.filter((x) => x.id === e.taskId);
      await db.insert(followUpTasks).values({
        organisationId: home.organisationId, homeId, childId: t.childId, sourceType: "engine", subjectKey: `${t.subjectKey}:escalation`, ruleKey: `${rule.key}.escalated`,
        title: `ESCALATED: ${t.title}`, detail: `Open since ${t.createdAt.toLocaleDateString("en-GB")} and overdue by more than ${rule.escalateAfterDays} days.`, regulation: rule.regulation, ownerRole: rule.escalateTo!, dueAt: new Date(now.getTime() + 2 * 86_400_000), createdBy: triggeredBy,
      });
      await db.update(followUpTasks).set({ escalatedAt: now }).where(eq(followUpTasks.id, e.taskId));
    }
    summary[rule.key] = { findings: findings.length, created: r.create.length, resolved: r.resolve.length, escalated: r.escalate.length };
  }

  const { score } = complianceScore(counts);
  const durationMs = Date.now() - started;
  await db.insert(ruleRuns).values({ organisationId: home.organisationId, homeId, triggeredBy, summary, score, durationMs });
  const changed = Object.values(summary).reduce((n, s) => n + s.created + s.resolved + s.escalated, 0);
  if (changed > 0 || triggeredBy) {
    await audit({ organisationId: home.organisationId, homeId, actorUserId: triggeredBy, actorRole: null, action: "create", entityType: "rule_run", entityId: homeId, diff: { after: { score, changed } } });
  }
  return { homeId, score, summary, durationMs };
}

export async function runEngineForAll(now = new Date()): Promise<RunResult[]> {
  const all = await db.select({ id: homes.id }).from(homes).where(eq(homes.active, true));
  const out: RunResult[] = [];
  for (const h of all) out.push(await runEngineForHome(h.id, null, now));
  return out;
}

export async function latestRun(homeId: string) {
  const [r] = await db.select().from(ruleRuns).where(eq(ruleRuns.homeId, homeId)).orderBy(desc(ruleRuns.ranAt)).limit(1);
  return r ?? null;
}
