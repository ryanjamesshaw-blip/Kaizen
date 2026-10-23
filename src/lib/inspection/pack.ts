import "server-only";
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, checkResults, checkTypes, children, childVoice, homes, incidents, memberships, missingEpisodes, notifications, physicalInterventions, placementPlans, placements, reg44Visits, reg45Reviews, riskAssessments, staffRecords, supervisions, trainingRecords, users, visitorsLog } from "@/db/schema";
import { homeMetrics } from "@/lib/governance/metrics";
import { schedule2Missing, trainingStatus } from "@/lib/rules/operations";
import { isOverdue } from "@/lib/records/lifecycle";

/**
 * Everything in the evidence pack, assembled once. Period defaults to the
 * last 12 months, which is what an inspection looks back over.
 */
export async function evidencePack(homeId: string, from: Date, to: Date, now = new Date()) {
  const [home] = await db.select().from(homes).where(eq(homes.id, homeId)).limit(1);
  if (!home) return null;
  const toEnd = new Date(to.getTime() + 86_400_000 - 1);
  const m = await homeMetrics(homeId, from, to, now);

  const [reg, staff, incs, pis, missing, notes, risks, plans, voice, visits, reviews, drills, visitors] = await Promise.all([
    // Sch 4 para 1 — register of children
    db.select({ c: children, p: placements }).from(placements).innerJoin(children, eq(children.id, placements.childId)).where(eq(placements.homeId, homeId)).orderBy(desc(placements.admittedOn)),
    // Sch 4 para 2 — staff register + Sch 2 status
    db.select({ u: users, m: memberships, r: staffRecords }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).leftJoin(staffRecords, and(eq(staffRecords.userId, users.id), eq(staffRecords.organisationId, home.organisationId))).where(and(eq(memberships.homeId, homeId), isNull(memberships.revokedAt))).orderBy(users.fullName),
    db.select({ i: incidents, childFirst: children.firstName, childLast: children.lastName }).from(incidents).leftJoin(children, eq(children.id, incidents.childId)).where(and(eq(incidents.homeId, homeId), gte(incidents.occurredAt, from), lte(incidents.occurredAt, toEnd), isNull(incidents.supersedesId))).orderBy(desc(incidents.occurredAt)),
    db.select({ pi: physicalInterventions, childFirst: children.firstName, childLast: children.lastName }).from(physicalInterventions).innerJoin(children, eq(children.id, physicalInterventions.childId)).where(and(eq(physicalInterventions.homeId, homeId), gte(physicalInterventions.startedAt, from), lte(physicalInterventions.startedAt, toEnd))).orderBy(desc(physicalInterventions.startedAt)),
    db.select({ me: missingEpisodes, childFirst: children.firstName, childLast: children.lastName }).from(missingEpisodes).innerJoin(children, eq(children.id, missingEpisodes.childId)).where(and(eq(missingEpisodes.homeId, homeId), gte(missingEpisodes.leftAt, from), lte(missingEpisodes.leftAt, toEnd))).orderBy(desc(missingEpisodes.leftAt)),
    db.select().from(notifications).where(and(eq(notifications.homeId, homeId), gte(notifications.sentAt, from), lte(notifications.sentAt, toEnd))).orderBy(desc(notifications.sentAt)),
    db.select({ r: riskAssessments, childFirst: children.firstName, childLast: children.lastName }).from(riskAssessments).innerJoin(children, eq(children.id, riskAssessments.childId)).where(and(eq(riskAssessments.homeId, homeId), isNull(children.archivedAt), sql`${riskAssessments.id} NOT IN (SELECT supersedes_id FROM risk_assessments WHERE supersedes_id IS NOT NULL)`)).orderBy(children.lastName, riskAssessments.reviewDueOn),
    db.select({ p: placementPlans, childFirst: children.firstName, childLast: children.lastName }).from(placementPlans).innerJoin(children, eq(children.id, placementPlans.childId)).where(and(eq(placementPlans.homeId, homeId), isNull(children.archivedAt), sql`${placementPlans.id} NOT IN (SELECT supersedes_id FROM placement_plans WHERE supersedes_id IS NOT NULL)`)),
    db.select({ v: childVoice, childFirst: children.firstName, childLast: children.lastName }).from(childVoice).innerJoin(children, eq(children.id, childVoice.childId)).where(and(eq(childVoice.homeId, homeId), gte(childVoice.recordedOn, from), lte(childVoice.recordedOn, to))).orderBy(desc(childVoice.recordedOn)).limit(40),
    db.select({ v: reg44Visits, visitor: users.fullName }).from(reg44Visits).leftJoin(users, eq(users.id, reg44Visits.visitorUserId)).where(and(eq(reg44Visits.homeId, homeId), gte(reg44Visits.visitedOn, from), lte(reg44Visits.visitedOn, to), isNull(reg44Visits.supersedesId))).orderBy(desc(reg44Visits.visitedOn)),
    db.select().from(reg45Reviews).where(and(eq(reg45Reviews.homeId, homeId), isNull(reg45Reviews.supersedesId))).orderBy(desc(reg45Reviews.periodTo)).limit(3),
    // Sch 4 para 6 — fire drills
    db.select({ r: checkResults, name: checkTypes.name }).from(checkResults).innerJoin(checkTypes, eq(checkTypes.id, checkResults.checkTypeId)).where(and(eq(checkResults.homeId, homeId), sql`${checkTypes.name} ILIKE '%fire%'`, gte(checkResults.checkedOn, from), lte(checkResults.checkedOn, to))).orderBy(desc(checkResults.checkedOn)),
    // Sch 4 para 5 — visitors
    db.select().from(visitorsLog).where(and(eq(visitorsLog.homeId, homeId), gte(visitorsLog.arrivedAt, from), lte(visitorsLog.arrivedAt, toEnd))).orderBy(desc(visitorsLog.arrivedAt)).limit(200),
  ]);

  const staffIds = staff.map((s) => s.u.id);
  const [sups, training] = staffIds.length ? await Promise.all([
    db.select().from(supervisions).where(sql`${supervisions.staffUserId} IN ${staffIds}`).orderBy(desc(supervisions.heldOn)),
    db.select().from(trainingRecords).where(sql`${trainingRecords.staffUserId} IN ${staffIds}`),
  ]) : [[], []];

  const childIds = [...new Set(reg.map((r) => r.c.id))];
  const childrenNoPlan = reg.filter((r) => !r.p.dischargedOn && !plans.some((p) => p.p.childId === r.c.id));

  return {
    home, period: { from, to }, metrics: m,
    register: reg,
    staff: staff.map((s) => ({
      ...s,
      schedule2Missing: schedule2Missing(s.r),
      lastSupervision: sups.find((x) => x.staffUserId === s.u.id && x.kind === "supervision")?.heldOn ?? null,
      lastAppraisal: sups.find((x) => x.staffUserId === s.u.id && x.kind === "appraisal")?.heldOn ?? null,
      trainingExpired: training.filter((t) => t.staffUserId === s.u.id && trainingStatus(t.expiresOn, now) === "expired").length,
    })),
    incidents: incs, restraints: pis, missing, notifications: notes,
    risks: risks.map((r) => ({ ...r, overdue: isOverdue(r.r.reviewDueOn, now) })),
    plans, childrenNoPlan, voice, reg44: visits, reg45: reviews, fireDrills: drills, visitors,
    childCount: childIds.length,
  };
}
export type EvidencePack = NonNullable<Awaited<ReturnType<typeof evidencePack>>>;

/** Reads made by one user in a window — the inspector's own access trail. */
export async function accessTrail(userId: string, from: Date, to: Date) {
  return db.select().from(auditEvents).where(and(eq(auditEvents.actorUserId, userId), gte(auditEvents.occurredAt, from), lte(auditEvents.occurredAt, to))).orderBy(asc(auditEvents.seq));
}

