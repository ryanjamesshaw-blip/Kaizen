import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  children,
  chronologyEntries,
  documents,
  homes,
  placementPlans,
  placements,
  riskAssessments,
  users,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { requestMeta, type CurrentUser } from "@/lib/auth/session";
import { can, visibleHomes } from "@/lib/rbac";

export function fullName(c: { firstName: string; lastName: string; preferredName?: string | null }) {
  const base = `${c.firstName} ${c.lastName}`;
  return c.preferredName && c.preferredName !== c.firstName ? `${base} (${c.preferredName})` : base;
}

export function ageOn(dob: Date, on = new Date()): number {
  let age = on.getFullYear() - dob.getFullYear();
  const m = on.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) age--;
  return age;
}

/** Children in homes this user can see (and holds child:read for). */
export async function listVisibleChildren(user: CurrentUser, organisationId: string, homeId?: string) {
  const scope = visibleHomes(user.grants, organisationId);
  if (scope !== "all" && scope.length === 0) return [];
  const conds = [eq(children.organisationId, organisationId), isNull(children.archivedAt)];
  if (scope !== "all") conds.push(inArray(children.homeId, scope));
  if (homeId) conds.push(eq(children.homeId, homeId));
  const rows = await db
    .select({
      id: children.id,
      firstName: children.firstName,
      lastName: children.lastName,
      preferredName: children.preferredName,
      dateOfBirth: children.dateOfBirth,
      homeId: children.homeId,
      homeName: homes.name,
      legalStatus: children.legalStatus,
      placingAuthority: children.placingAuthority,
      keyWorkerName: users.fullName,
    })
    .from(children)
    .innerJoin(homes, eq(homes.id, children.homeId))
    .leftJoin(users, eq(users.id, children.keyWorkerUserId))
    .where(and(...conds))
    .orderBy(children.lastName, children.firstName);
  // child:read is role-gated as well as scope-gated (system_admin sees homes, not children)
  return rows.filter((r) => can(user.grants, "child:read", { organisationId, homeId: r.homeId }));
}

/** Load one child, enforcing scope + child:read, and audit the read. */
export async function getChildForUser(user: CurrentUser, childId: string) {
  const [child] = await db.select().from(children).where(eq(children.id, childId)).limit(1);
  if (!child) return null;
  if (!can(user.grants, "child:read", { organisationId: child.organisationId, homeId: child.homeId })) return null;
  await audit({
    organisationId: child.organisationId,
    homeId: child.homeId,
    actorUserId: user.id,
    actorRole: user.role,
    action: "read",
    entityType: "child",
    entityId: child.id,
    ...(await requestMeta()),
  });
  return child;
}

export async function getChildBundle(user: CurrentUser, childId: string) {
  const child = await getChildForUser(user, childId);
  if (!child) return null;
  const [placementRows, planRows, riskRows, chronoRows, docRows, keyWorker] = await Promise.all([
    db.select().from(placements).where(eq(placements.childId, child.id)).orderBy(desc(placements.admittedOn)),
    db.select().from(placementPlans).where(eq(placementPlans.childId, child.id)).orderBy(desc(placementPlans.version), desc(placementPlans.createdAt)),
    db
      .select({ r: riskAssessments, authorName: users.fullName })
      .from(riskAssessments)
      .leftJoin(users, eq(users.id, riskAssessments.createdBy))
      .where(eq(riskAssessments.childId, child.id))
      .orderBy(desc(riskAssessments.createdAt)),
    db
      .select({ e: chronologyEntries, authorName: users.fullName })
      .from(chronologyEntries)
      .leftJoin(users, eq(users.id, chronologyEntries.createdBy))
      .where(eq(chronologyEntries.childId, child.id))
      .orderBy(desc(chronologyEntries.occurredOn), desc(chronologyEntries.createdAt)),
    db
      .select({
        id: documents.id,
        type: documents.type,
        title: documents.title,
        fileName: documents.fileName,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        documentDate: documents.documentDate,
        createdAt: documents.createdAt,
        notes: documents.notes,
      })
      .from(documents)
      .where(eq(documents.childId, child.id))
      .orderBy(desc(documents.createdAt)),
    child.keyWorkerUserId
      ? db.select({ fullName: users.fullName }).from(users).where(eq(users.id, child.keyWorkerUserId)).limit(1)
      : Promise.resolve([]),
  ]);
  return {
    child,
    placements: placementRows,
    plans: planRows,
    risks: riskRows,
    chronology: chronoRows,
    documents: docRows,
    keyWorkerName: keyWorker[0]?.fullName ?? null,
    currentPlacement: placementRows.find((p) => !p.dischargedOn) ?? null,
  };
}

/** Risk assessments across the user's visible homes, for the home dashboard. */
export async function riskOverviewForHome(user: CurrentUser, organisationId: string, homeId: string) {
  if (!can(user.grants, "child:read", { organisationId, homeId })) return [];
  return db
    .select({
      id: riskAssessments.id,
      childId: riskAssessments.childId,
      childFirst: children.firstName,
      childLast: children.lastName,
      title: riskAssessments.title,
      level: riskAssessments.level,
      status: riskAssessments.status,
      reviewDueOn: riskAssessments.reviewDueOn,
    })
    .from(riskAssessments)
    .innerJoin(children, eq(children.id, riskAssessments.childId))
    .where(and(eq(riskAssessments.homeId, homeId), isNull(children.archivedAt), sql`${riskAssessments.id} NOT IN (SELECT supersedes_id FROM risk_assessments WHERE supersedes_id IS NOT NULL)`))
    .orderBy(riskAssessments.reviewDueOn);
}

export async function getDocumentForUser(user: CurrentUser, documentId: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) return null;
  if (!can(user.grants, "child:read", { organisationId: doc.organisationId, homeId: doc.homeId })) return null;
  await audit({
    organisationId: doc.organisationId,
    homeId: doc.homeId,
    actorUserId: user.id,
    actorRole: user.role,
    action: "read",
    entityType: "document",
    entityId: doc.id,
    ...(await requestMeta()),
  });
  return doc;
}
