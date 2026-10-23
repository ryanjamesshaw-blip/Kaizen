import "server-only";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { children, childVoice, dailyLogs, followUpTasks, homes, incidents, keyworkSessions, marEntries, placements, reg44Visits, reg45Reviews, riskAssessments } from "@/db/schema";
import { checksBoard, staffCompliance, homeDocumentsList } from "@/lib/operations/queries";
import { missingLogs } from "@/lib/daily/queries";
import { reg44DueOn, reg45DueOn, cadenceStatus } from "@/lib/rules/governance";
import { isOverdue } from "@/lib/records/lifecycle";
import { latestRun } from "@/lib/engine/run";

export type HomeMetrics = {
  homeId: string;
  homeName: string;
  period: { from: Date; to: Date };
  children: { placed: number; admitted: number; discharged: number; capacity: number | null };
  incidents: { total: number; restraint: number; missing: number; safeguarding: number; complaints: number; allegations: number; medicationErrors: number; highOrCritical: number };
  followUps: { open: number; overdue: number; completedInPeriod: number };
  risk: { current: number; overdueReview: number };
  recording: { logsInPeriod: number; missingLogDays7: number; awaitingReview: number; keyworkInPeriod: number; voiceUnanswered: number };
  medication: { refusedOrMissed: number; errors: number };
  staff: { careStaff: number; supervisionOverdue: number; schedule2Incomplete: number; trainingExpired: number; level3Overdue: number };
  checks: { total: number; overdue: number; failedLast: number };
  score: number | null;
  governance: { lastReg44: Date | null; reg44Due: Date; reg44Status: "ok" | "due_soon" | "overdue"; reg44InPeriod: number; lastReg45To: Date | null; reg45Due: Date; reg45Status: "ok" | "due_soon" | "overdue"; sopOnFile: boolean; sopNotified: boolean; policiesOverdue: number };
};

function cnt<T extends Record<string, unknown>>(rows: T[], pred: (r: T) => boolean) {
  return rows.filter(pred).length;
}

/** Everything the governance layer needs about one home over a period. */
export async function homeMetrics(homeId: string, from: Date, to: Date, now = new Date()): Promise<HomeMetrics | null> {
  const [home] = await db.select().from(homes).where(eq(homes.id, homeId)).limit(1);
  if (!home) return null;
  const toEnd = new Date(to.getTime() + 86_400_000 - 1);

  const [kids, pls, incs, tasks, risks, logs, kw, voice, mar, visits, reviews, team, checks, docs, gaps] = await Promise.all([
    db.select({ id: children.id, archivedAt: children.archivedAt }).from(children).where(eq(children.homeId, homeId)),
    db.select().from(placements).where(eq(placements.homeId, homeId)),
    db.select().from(incidents).where(and(eq(incidents.homeId, homeId), gte(incidents.occurredAt, from), lte(incidents.occurredAt, toEnd), isNull(incidents.supersedesId))),
    db.select().from(followUpTasks).where(eq(followUpTasks.homeId, homeId)),
    db.select().from(riskAssessments).where(and(eq(riskAssessments.homeId, homeId), sql`${riskAssessments.id} NOT IN (SELECT supersedes_id FROM risk_assessments WHERE supersedes_id IS NOT NULL)`)),
    db.select({ status: dailyLogs.status }).from(dailyLogs).where(and(eq(dailyLogs.homeId, homeId), gte(dailyLogs.logDate, from), lte(dailyLogs.logDate, to))),
    db.select({ id: keyworkSessions.id }).from(keyworkSessions).where(and(eq(keyworkSessions.homeId, homeId), gte(keyworkSessions.sessionDate, from), lte(keyworkSessions.sessionDate, to))),
    db.select({ outcome: childVoice.outcome }).from(childVoice).where(eq(childVoice.homeId, homeId)),
    db.select({ outcome: marEntries.outcome }).from(marEntries).where(and(eq(marEntries.homeId, homeId), gte(marEntries.administeredAt, from), lte(marEntries.administeredAt, toEnd))),
    db.select({ visitedOn: reg44Visits.visitedOn }).from(reg44Visits).where(and(eq(reg44Visits.homeId, homeId), isNull(reg44Visits.supersedesId))).orderBy(sql`${reg44Visits.visitedOn} desc`),
    db.select({ periodTo: reg45Reviews.periodTo, status: reg45Reviews.status }).from(reg45Reviews).where(and(eq(reg45Reviews.homeId, homeId), isNull(reg45Reviews.supersedesId))).orderBy(sql`${reg45Reviews.periodTo} desc`),
    staffCompliance(home.organisationId, homeId, now),
    checksBoard(homeId, now),
    homeDocumentsList(homeId),
    missingLogs(homeId, 7),
  ]);
  const run = await latestRun(homeId);

  const activeKids = kids.filter((k) => !k.archivedAt);
  const currentRisks = risks.filter((r) => activeKids.some((k) => k.id === r.childId));
  const lastReg44 = visits[0]?.visitedOn ?? null;
  const lastReg45 = reviews.find((r) => r.status === "locked")?.periodTo ?? reviews[0]?.periodTo ?? null;
  const reg44Due = reg44DueOn(lastReg44, home.createdAt);
  const reg45Due = reg45DueOn(lastReg45, home.createdAt);
  const currentDocs = docs.filter((d) => d.current);
  const sop = currentDocs.find((d) => d.d.kind === "statement_of_purpose");

  return {
    homeId, homeName: home.name, period: { from, to }, score: run?.score ?? null,
    children: {
      placed: activeKids.length,
      admitted: cnt(pls, (p) => p.admittedOn >= from && p.admittedOn <= to),
      discharged: cnt(pls, (p) => !!p.dischargedOn && p.dischargedOn >= from && p.dischargedOn <= to),
      capacity: home.capacity,
    },
    incidents: {
      total: incs.length,
      restraint: cnt(incs, (i) => i.type === "physical_intervention"),
      missing: cnt(incs, (i) => i.type === "missing"),
      safeguarding: cnt(incs, (i) => i.type === "safeguarding"),
      complaints: cnt(incs, (i) => i.type === "complaint"),
      allegations: cnt(incs, (i) => i.type === "allegation_against_staff"),
      medicationErrors: cnt(incs, (i) => i.type === "medication_error"),
      highOrCritical: cnt(incs, (i) => i.severity === "high" || i.severity === "critical"),
    },
    followUps: {
      open: cnt(tasks, (t) => t.status === "open"),
      overdue: cnt(tasks, (t) => t.status === "open" && t.dueAt < now),
      completedInPeriod: cnt(tasks, (t) => t.status === "done" && !!t.completedAt && t.completedAt >= from && t.completedAt <= toEnd),
    },
    risk: { current: currentRisks.length, overdueReview: cnt(currentRisks, (r) => isOverdue(r.reviewDueOn, now)) },
    recording: {
      logsInPeriod: logs.length, missingLogDays7: gaps.length, awaitingReview: cnt(logs, (l) => l.status === "submitted"),
      keyworkInPeriod: kw.length, voiceUnanswered: cnt(voice, (v) => !v.outcome),
    },
    medication: { refusedOrMissed: cnt(mar, (m) => m.outcome === "refused" || m.outcome === "missed"), errors: cnt(mar, (m) => m.outcome === "error") },
    staff: {
      careStaff: team.length,
      supervisionOverdue: cnt(team, (t) => t.supervisionStatus === "overdue" || t.supervisionStatus === "never"),
      schedule2Incomplete: cnt(team, (t) => t.schedule2Missing.length > 0),
      trainingExpired: team.reduce((n, t) => n + t.training.expired, 0),
      level3Overdue: cnt(team, (t) => t.level3 === "overdue"),
    },
    checks: { total: checks.length, overdue: cnt(checks, (c) => c.status === "overdue"), failedLast: cnt(checks, (c) => !!c.last && !c.last.passed) },
    governance: {
      lastReg44, reg44Due, reg44Status: cadenceStatus(reg44Due, now), reg44InPeriod: cnt(visits, (v) => v.visitedOn >= from && v.visitedOn <= to),
      lastReg45To: lastReg45, reg45Due, reg45Status: cadenceStatus(reg45Due, now, 30),
      sopOnFile: !!sop, sopNotified: !!sop?.d.ofstedNotifiedOn, policiesOverdue: cnt(currentDocs, (d) => d.d.kind === "policy" && isOverdue(d.d.reviewDueOn, now)),
    },
  };
}

/** Flatten for the Reg 45 jsonb snapshot. */
export function snapshotOf(m: HomeMetrics): Record<string, unknown> {
  return JSON.parse(JSON.stringify(m));
}

