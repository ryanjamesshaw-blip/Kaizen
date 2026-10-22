import "server-only";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, users } from "@/db/schema";
import { visibleHomes } from "@/lib/rbac";
import type { CurrentUser } from "@/lib/auth/session";
import { verifyChain } from "./hash";

export async function listAuditEvents(user: CurrentUser, organisationId: string, limit = 100) {
  const scope = visibleHomes(user.grants, organisationId);
  const scopeWhere =
    scope === "all"
      ? or(eq(auditEvents.organisationId, organisationId), isNull(auditEvents.organisationId))
      : and(
          eq(auditEvents.organisationId, organisationId),
          scope.length ? inArray(auditEvents.homeId, scope) : sql`false`,
        );
  return db
    .select({
      seq: auditEvents.seq,
      occurredAt: auditEvents.occurredAt,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      actorName: users.fullName,
      actorRole: auditEvents.actorRole,
      reason: auditEvents.reason,
      ipAddress: auditEvents.ipAddress,
      homeId: auditEvents.homeId,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(scopeWhere)
    .orderBy(desc(auditEvents.seq))
    .limit(limit);
}

/** Walk the entire chain. Returns { ok, count, brokenAt }. */
export async function verifyAuditChain() {
  const rows = await db.select().from(auditEvents).orderBy(auditEvents.seq);
  const brokenAt = verifyChain(
    rows.map((r) => ({
      seq: r.seq,
      prevHash: r.prevHash,
      hash: r.hash,
      occurredAt: r.occurredAt.toISOString(),
      organisationId: r.organisationId,
      homeId: r.homeId,
      actorUserId: r.actorUserId,
      actorRole: r.actorRole,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      diff: r.diff,
      reason: r.reason,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
    })),
  );
  return { ok: brokenAt === null, count: rows.length, brokenAt };
}
