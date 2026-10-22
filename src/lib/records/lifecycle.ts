/**
 * Record lifecycle — pure functions, no I/O.
 *
 *   draft ──submit──▶ submitted ──review──▶ reviewed ──lock──▶ locked
 *     ▲                   │                                     │
 *     └──────return───────┘                                  amend
 *                                                              │
 *                                                              ▼
 *                                                     new draft (version+1,
 *                                                     supersedes the locked one)
 *
 * Hard rule #3: a locked record is never mutated. Amending creates a new row.
 */
import type { RecordStatus } from "@/db/schema";
import type { Grant, Permission } from "@/lib/rbac";
import { can } from "@/lib/rbac";

export type Transition = "edit" | "submit" | "return" | "review" | "lock" | "amend";

const TRANSITIONS: Record<Transition, { from: RecordStatus[]; to: RecordStatus | null; permission: Permission }> = {
  edit: { from: ["draft"], to: "draft", permission: "child:write" },
  submit: { from: ["draft"], to: "submitted", permission: "record:submit" },
  return: { from: ["submitted", "reviewed"], to: "draft", permission: "record:review" },
  review: { from: ["submitted"], to: "reviewed", permission: "record:review" },
  lock: { from: ["reviewed", "submitted"], to: "locked", permission: "record:lock" },
  // amend produces a new draft row; `to` is null because the original is untouched
  amend: { from: ["locked"], to: null, permission: "record:amend" },
};

export type LifecycleContext = {
  grants: Grant[];
  userId: string;
  organisationId: string;
  homeId: string;
  record: { status: RecordStatus; createdBy: string | null };
};

export function canTransition(t: Transition, ctx: LifecycleContext, now = new Date()): boolean {
  const rule = TRANSITIONS[t];
  if (!rule.from.includes(ctx.record.status)) return false;
  if (!can(ctx.grants, rule.permission, { organisationId: ctx.organisationId, homeId: ctx.homeId }, now)) return false;
  // A care worker may only edit or submit drafts they authored.
  if ((t === "edit" || t === "submit") && !can(ctx.grants, "record:review", { organisationId: ctx.organisationId, homeId: ctx.homeId }, now)) {
    return ctx.record.createdBy === ctx.userId;
  }
  return true;
}

export function nextStatus(t: Transition): RecordStatus | null {
  return TRANSITIONS[t].to;
}

export function availableTransitions(ctx: LifecycleContext, now = new Date()): Transition[] {
  return (Object.keys(TRANSITIONS) as Transition[]).filter((t) => t !== "edit" && canTransition(t, ctx, now));
}

export const STATUS_LABELS: Record<RecordStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  reviewed: "Reviewed",
  locked: "Locked",
};

export const TRANSITION_LABELS: Record<Transition, string> = {
  edit: "Edit",
  submit: "Submit for review",
  return: "Return for correction",
  review: "Mark reviewed",
  lock: "Lock",
  amend: "Amend (new version)",
};

/** Is a review date overdue? Pure so the rules engine can reuse it. */
export function isOverdue(reviewDueOn: Date | null | undefined, now = new Date()): boolean {
  if (!reviewDueOn) return false;
  const due = new Date(reviewDueOn);
  due.setHours(23, 59, 59, 999);
  return due < now;
}

export function daysUntil(date: Date, now = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
}
