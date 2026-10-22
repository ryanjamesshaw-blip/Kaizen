import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { placementPlans, riskAssessments } from "@/db/schema";
import { audit } from "@/lib/audit";
import { Forbidden } from "@/lib/auth/guard";
import { requestMeta, type CurrentUser } from "@/lib/auth/session";
import { canTransition, nextStatus, type Transition } from "./lifecycle";

export type LifecycleTable = "risk_assessment" | "placement_plan";

const TABLES = {
  risk_assessment: riskAssessments,
  placement_plan: placementPlans,
} as const;

/**
 * Apply a lifecycle transition to a versioned record.
 * - submit / return / review / lock: update status + stamp on the SAME row
 *   (these rows are not yet locked, so in-place status changes are fine).
 * - amend: insert a NEW row cloned from the locked one, version+1,
 *   supersedesId = original, status draft, with the reason. Original untouched.
 * Returns the id of the row that is now current.
 */
export async function applyTransition(
  user: CurrentUser,
  table: LifecycleTable,
  id: string,
  transition: Transition,
  reason?: string,
): Promise<string> {
  const t = TABLES[table];
  const [row] = await db.select().from(t).where(eq(t.id, id)).limit(1);
  if (!row) throw new Error("Record not found");

  const ok = canTransition(transition, {
    grants: user.grants,
    userId: user.id,
    organisationId: row.organisationId,
    homeId: row.homeId,
    record: { status: row.status, createdBy: row.createdBy },
  });
  if (!ok) throw new Forbidden(`Cannot ${transition} this record`);

  const meta = await requestMeta();
  const now = new Date();

  if (transition === "amend") {
    if (!reason || reason.trim().length < 5) throw new Error("A reason is required to amend a locked record");
    const LIFECYCLE_KEYS = new Set(["id", "status", "version", "supersedesId", "amendmentReason", "submittedAt", "submittedBy", "reviewedAt", "reviewedBy", "lockedAt", "lockedBy", "createdAt", "createdBy", "updatedAt", "updatedBy"]);
    const content = Object.fromEntries(Object.entries(row).filter(([k]) => !LIFECYCLE_KEYS.has(k)));
    const version = row.version;
    // Table is chosen at runtime; cast through the shared insert shape.
    const insertTable = t as unknown as typeof riskAssessments;
    const [created] = await db
      .insert(insertTable)
      .values({
        ...content,
        version: version + 1,
        supersedesId: row.id,
        amendmentReason: reason.trim(),
        status: "draft",
        createdBy: user.id,
        updatedBy: user.id,
      } as unknown as typeof riskAssessments.$inferInsert)
      .returning({ id: insertTable.id });
    await audit({
      organisationId: row.organisationId, homeId: row.homeId, actorUserId: user.id, actorRole: user.role,
      action: "amend", entityType: table, entityId: created.id, reason: reason.trim(),
      diff: { supersedes: row.id, version: version + 1 }, ...meta,
    });
    return created.id;
  }

  const to = nextStatus(transition)!;
  const stamp: Partial<typeof t.$inferInsert> = { status: to, updatedAt: now, updatedBy: user.id };
  if (transition === "submit") Object.assign(stamp, { submittedAt: now, submittedBy: user.id });
  if (transition === "review") Object.assign(stamp, { reviewedAt: now, reviewedBy: user.id });
  if (transition === "lock") Object.assign(stamp, { lockedAt: now, lockedBy: user.id });
  if (transition === "return") Object.assign(stamp, { submittedAt: null, submittedBy: null, reviewedAt: null, reviewedBy: null });

  await db.update(t).set(stamp).where(eq(t.id, id));
  await audit({
    organisationId: row.organisationId, homeId: row.homeId, actorUserId: user.id, actorRole: user.role,
    action: transition === "return" ? "update" : (transition as "submit" | "review" | "lock"),
    entityType: table, entityId: id, reason: reason?.trim() || null,
    diff: { before: { status: row.status }, after: { status: to } }, ...meta,
  });
  return id;
}
