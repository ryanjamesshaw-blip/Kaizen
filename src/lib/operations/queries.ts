import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { checkResults, checkTypes, children, homeDocuments, maintenanceItems, marEntries, medications, memberships, moneyLedger, staffRecords, supervisions, trainingRecords, users } from "@/db/schema";
import { checkDueOn, checkStatus, dbsStatus, level3Status, MANDATORY_COURSES, schedule2Missing, supervisionDueOn, supervisionStatus, trainingStatus } from "@/lib/rules/operations";

/** One row per care-facing member of staff with compliance status. */
export async function staffCompliance(organisationId: string, homeId: string, now = new Date()) {
  const staff = await db
    .select({ userId: users.id, fullName: users.fullName, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organisationId, organisationId), eq(memberships.homeId, homeId), isNull(memberships.revokedAt), inArray(memberships.role, ["registered_manager", "deputy", "care_worker"]), eq(users.active, true)))
    .orderBy(users.fullName);
  if (staff.length === 0) return [];
  const ids = staff.map((s) => s.userId);
  const [records, sups, training] = await Promise.all([
    db.select().from(staffRecords).where(and(eq(staffRecords.organisationId, organisationId), inArray(staffRecords.userId, ids))),
    db.select({ staffUserId: supervisions.staffUserId, heldOn: supervisions.heldOn, kind: supervisions.kind }).from(supervisions).where(inArray(supervisions.staffUserId, ids)).orderBy(desc(supervisions.heldOn)),
    db.select().from(trainingRecords).where(inArray(trainingRecords.staffUserId, ids)),
  ]);
  return staff.map((s) => {
    const r = records.find((x) => x.userId === s.userId) ?? null;
    const lastSup = sups.find((x) => x.staffUserId === s.userId && x.kind === "supervision")?.heldOn ?? null;
    const lastAppraisal = sups.find((x) => x.staffUserId === s.userId && x.kind === "appraisal")?.heldOn ?? null;
    const supDue = supervisionDueOn(lastSup, r?.startDate ?? null, r?.probationEndsOn ?? null, now);
    const mine = training.filter((t) => t.staffUserId === s.userId);
    const latestByCourse = new Map<string, typeof mine[number]>();
    for (const t of mine) { const cur = latestByCourse.get(t.course); if (!cur || t.completedOn > cur.completedOn) latestByCourse.set(t.course, t); }
    const expired = [...latestByCourse.values()].filter((t) => trainingStatus(t.expiresOn, now) === "expired").length;
    const expiring = [...latestByCourse.values()].filter((t) => trainingStatus(t.expiresOn, now) === "expiring").length;
    const mandatoryMissing = MANDATORY_COURSES.filter((c) => !latestByCourse.has(c) || trainingStatus(latestByCourse.get(c)!.expiresOn, now) === "expired");
    return {
      ...s, record: r, lastSupervision: lastSup, supervisionDue: supDue, supervisionStatus: supervisionStatus(lastSup, supDue, now),
      lastAppraisal, schedule2Missing: schedule2Missing(r), level3: r ? level3Status(r, now) : "unknown", dbs: dbsStatus(r?.dbsIssuedOn ?? null, r?.dbsUpdateService ?? false, now),
      training: { held: latestByCourse.size, expired, expiring, mandatoryMissing },
    };
  });
}

export async function staffDetail(organisationId: string, userId: string) {
  const [user] = await db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [record] = await db.select().from(staffRecords).where(and(eq(staffRecords.organisationId, organisationId), eq(staffRecords.userId, userId))).limit(1);
  const [sups, training, ms] = await Promise.all([
    db.select({ s: supervisions, supervisorName: users.fullName }).from(supervisions).leftJoin(users, eq(users.id, supervisions.supervisorUserId)).where(eq(supervisions.staffUserId, userId)).orderBy(desc(supervisions.heldOn)),
    db.select().from(trainingRecords).where(eq(trainingRecords.staffUserId, userId)).orderBy(desc(trainingRecords.completedOn)),
    db.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.organisationId, organisationId), isNull(memberships.revokedAt))),
  ]);
  return { user, record: record ?? null, supervisions: sups, training, memberships: ms };
}

export async function homeMedicationBoard(homeId: string) {
  const meds = await db
    .select({ m: medications, childFirst: children.firstName, childLast: children.lastName })
    .from(medications)
    .innerJoin(children, eq(children.id, medications.childId))
    .where(and(eq(medications.homeId, homeId), isNull(children.archivedAt), sql`(${medications.endOn} IS NULL OR ${medications.endOn} >= current_date)`))
    .orderBy(children.firstName, medications.name);
  return meds;
}

export async function childMedication(childId: string) {
  const [meds, entries] = await Promise.all([
    db.select().from(medications).where(eq(medications.childId, childId)).orderBy(desc(medications.startOn)),
    db.select({ e: marEntries, byName: users.fullName }).from(marEntries).leftJoin(users, eq(users.id, marEntries.administeredBy)).where(eq(marEntries.childId, childId)).orderBy(desc(marEntries.administeredAt)).limit(60),
  ]);
  return { meds, entries };
}

export async function checksBoard(homeId: string, now = new Date()) {
  const types = await db.select().from(checkTypes).where(and(eq(checkTypes.homeId, homeId), eq(checkTypes.active, true))).orderBy(checkTypes.frequencyDays, checkTypes.name);
  if (!types.length) return [];
  const results = await db.select().from(checkResults).where(inArray(checkResults.checkTypeId, types.map((t) => t.id))).orderBy(desc(checkResults.checkedOn));
  return types.map((t) => {
    const last = results.find((r) => r.checkTypeId === t.id) ?? null;
    const dueOn = checkDueOn(last?.checkedOn ?? null, t.frequencyDays, t.createdAt);
    return { type: t, last, dueOn, status: checkStatus(dueOn, now) };
  });
}

export async function maintenanceList(homeId: string) {
  return db.select({ m: maintenanceItems, reporter: users.fullName }).from(maintenanceItems).leftJoin(users, eq(users.id, maintenanceItems.reportedBy)).where(eq(maintenanceItems.homeId, homeId)).orderBy(sql`case when ${maintenanceItems.status} = 'done' then 1 else 0 end`, desc(maintenanceItems.reportedOn));
}

export async function ledger(homeId: string, childId: string | null) {
  return db
    .select({ e: moneyLedger, byName: users.fullName })
    .from(moneyLedger)
    .leftJoin(users, eq(users.id, moneyLedger.recordedBy))
    .where(and(eq(moneyLedger.homeId, homeId), childId ? eq(moneyLedger.childId, childId) : isNull(moneyLedger.childId)))
    .orderBy(desc(moneyLedger.entryOn), desc(moneyLedger.createdAt));
}

export async function homeDocumentsList(homeId: string) {
  const rows = await db.select({ d: { id: homeDocuments.id, kind: homeDocuments.kind, title: homeDocuments.title, version: homeDocuments.version, effectiveFrom: homeDocuments.effectiveFrom, reviewDueOn: homeDocuments.reviewDueOn, summaryOfChanges: homeDocuments.summaryOfChanges, ofstedNotifiedOn: homeDocuments.ofstedNotifiedOn, fileName: homeDocuments.fileName, supersedesId: homeDocuments.supersedesId, createdAt: homeDocuments.createdAt }, byName: users.fullName }).from(homeDocuments).leftJoin(users, eq(users.id, homeDocuments.createdBy)).where(eq(homeDocuments.homeId, homeId)).orderBy(homeDocuments.kind, desc(homeDocuments.effectiveFrom));
  const superseded = new Set(rows.map((r) => r.d.supersedesId).filter(Boolean));
  return rows.map((r) => ({ ...r, current: !superseded.has(r.d.id) }));
}
