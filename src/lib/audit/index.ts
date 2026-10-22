import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, type AuditAction, type Role } from "@/db/schema";
import { computeHash, type AuditContent } from "./hash";

export type AuditInput = {
  organisationId?: string | null;
  homeId?: string | null;
  actorUserId?: string | null;
  actorRole?: Role | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  diff?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Append one event to the audit log, chained to the previous event.
 *
 * The previous row is read with FOR UPDATE inside a transaction so two
 * concurrent writers cannot both chain to the same predecessor.
 */
export async function audit(input: AuditInput): Promise<number> {
  return db.transaction(async (tx) => {
    // Serialise chain appends. pg_advisory_xact_lock is released at commit.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(42)`);
    const [prev] = await tx
      .select({ hash: auditEvents.hash })
      .from(auditEvents)
      .orderBy(sql`${auditEvents.seq} DESC`)
      .limit(1);

    const content: AuditContent = {
      occurredAt: new Date().toISOString(),
      organisationId: input.organisationId ?? null,
      homeId: input.homeId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      diff: input.diff ?? null,
      reason: input.reason ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    };
    const prevHash = prev?.hash ?? null;
    const hash = computeHash(prevHash, content);

    const [row] = await tx
      .insert(auditEvents)
      .values({
        occurredAt: new Date(content.occurredAt),
        organisationId: content.organisationId,
        homeId: content.homeId,
        actorUserId: content.actorUserId,
        actorRole: content.actorRole as Role | null,
        action: input.action,
        entityType: content.entityType,
        entityId: content.entityId,
        diff: content.diff,
        reason: content.reason,
        ipAddress: content.ipAddress,
        userAgent: content.userAgent,
        prevHash,
        hash,
      })
      .returning({ seq: auditEvents.seq });
    return row.seq;
  });
}
