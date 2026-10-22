/**
 * Pure helpers for the audit hash chain. No I/O so they are unit-testable.
 *
 * Each audit event's hash = sha256(prevHash + canonicalJson(content)).
 * Changing, removing or reordering any historical row breaks every hash
 * after it, so tampering is detectable by walking the chain.
 */
import { createHash } from "node:crypto";

export type AuditContent = {
  occurredAt: string; // ISO
  organisationId: string | null;
  homeId: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  diff: unknown;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

/** Deterministic JSON: keys sorted recursively, no whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function computeHash(prevHash: string | null, content: AuditContent): string {
  return createHash("sha256")
    .update(prevHash ?? "")
    .update(canonicalJson(content))
    .digest("hex");
}

/**
 * Verify a sequence of events (ascending seq). Returns the seq of the first
 * broken link, or null if the chain is intact.
 */
export function verifyChain(
  events: Array<AuditContent & { seq: number; prevHash: string | null; hash: string }>,
): number | null {
  let prev: string | null = null;
  for (const e of events) {
    if (e.prevHash !== prev) return e.seq;
    const content: AuditContent = {
      occurredAt: e.occurredAt, organisationId: e.organisationId, homeId: e.homeId,
      actorUserId: e.actorUserId, actorRole: e.actorRole, action: e.action,
      entityType: e.entityType, entityId: e.entityId, diff: e.diff, reason: e.reason,
      ipAddress: e.ipAddress, userAgent: e.userAgent,
    };
    if (computeHash(prev, content) !== e.hash) return e.seq;
    prev = e.hash;
  }
  return null;
}
