import "server-only";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { childVoice, children, dailyLogs, handovers, keyworkSessions, users } from "@/db/schema";
import { can } from "@/lib/rbac";
import type { CurrentUser } from "@/lib/auth/session";

/** YYYY-MM-DD in Europe/London for "today" in the home. */
export function todayLondon(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function toDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}
/** Suggest the current shift from the London clock. */
export function currentShift(now = new Date()): "early" | "late" | "night" {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(now));
  if (h >= 7 && h < 15) return "early";
  if (h >= 15 && h < 22) return "late";
  return "night";
}

/** The shift board: every child in the home with their log status for the date. */
export async function shiftBoard(user: CurrentUser, organisationId: string, homeId: string, ymd: string) {
  if (!can(user.grants, "child:read", { organisationId, homeId })) return null;
  const date = toDate(ymd);
  const kids = await db
    .select({ id: children.id, firstName: children.firstName, lastName: children.lastName, preferredName: children.preferredName })
    .from(children)
    .where(and(eq(children.homeId, homeId), isNull(children.archivedAt)))
    .orderBy(children.firstName);
  const logs = kids.length
    ? await db
        .select({ id: dailyLogs.id, childId: dailyLogs.childId, shift: dailyLogs.shift, status: dailyLogs.status, mood: dailyLogs.mood, concerns: dailyLogs.concerns, authorName: users.fullName, supersedesId: dailyLogs.supersedesId })
        .from(dailyLogs)
        .leftJoin(users, eq(users.id, dailyLogs.createdBy))
        .where(and(eq(dailyLogs.homeId, homeId), eq(dailyLogs.logDate, date), inArray(dailyLogs.childId, kids.map((k) => k.id))))
    : [];
  const superseded = new Set(logs.map((l) => l.supersedesId).filter(Boolean));
  // The most recent handover on or before this date, within two days — what
  // an incoming shift actually needs to read.
  const earliest = new Date(date); earliest.setUTCDate(earliest.getUTCDate() - 2);
  const [handover] = await db
    .select()
    .from(handovers)
    .where(and(eq(handovers.homeId, homeId), lte(handovers.handoverDate, date), gte(handovers.handoverDate, earliest)))
    .orderBy(desc(handovers.handoverDate), desc(handovers.createdAt))
    .limit(1);
  return { kids, logs: logs.filter((l) => !superseded.has(l.id)), handover: handover ?? null };
}

export async function childDailyRecords(user: CurrentUser, child: { id: string; organisationId: string; homeId: string }, days = 14) {
  if (!can(user.grants, "child:read", { organisationId: child.organisationId, homeId: child.homeId })) return null;
  const since = toDate(todayLondon());
  since.setUTCDate(since.getUTCDate() - days);
  const [logs, keywork, voice] = await Promise.all([
    db
      .select({ l: dailyLogs, authorName: users.fullName })
      .from(dailyLogs)
      .leftJoin(users, eq(users.id, dailyLogs.createdBy))
      .where(and(eq(dailyLogs.childId, child.id), gte(dailyLogs.logDate, since), sql`${dailyLogs.id} NOT IN (SELECT supersedes_id FROM daily_logs WHERE supersedes_id IS NOT NULL)`))
      .orderBy(desc(dailyLogs.logDate), desc(dailyLogs.createdAt)),
    db
      .select({ k: keyworkSessions, authorName: users.fullName })
      .from(keyworkSessions)
      .leftJoin(users, eq(users.id, keyworkSessions.createdBy))
      .where(and(eq(keyworkSessions.childId, child.id), sql`${keyworkSessions.id} NOT IN (SELECT supersedes_id FROM keywork_sessions WHERE supersedes_id IS NOT NULL)`))
      .orderBy(desc(keyworkSessions.sessionDate))
      .limit(12),
    db
      .select({ v: childVoice, authorName: users.fullName })
      .from(childVoice)
      .leftJoin(users, eq(users.id, childVoice.createdBy))
      .where(eq(childVoice.childId, child.id))
      .orderBy(desc(childVoice.recordedOn))
      .limit(20),
  ]);
  return { logs, keywork, voice };
}

export async function getDailyLog(id: string) {
  const [l] = await db.select().from(dailyLogs).where(eq(dailyLogs.id, id)).limit(1);
  return l ?? null;
}
export async function getKeywork(id: string) {
  const [k] = await db.select().from(keyworkSessions).where(eq(keyworkSessions.id, id)).limit(1);
  return k ?? null;
}

/** Recent handovers for the home. */
export async function recentHandovers(homeId: string, limit = 10) {
  return db
    .select({ h: handovers, authorName: users.fullName })
    .from(handovers)
    .leftJoin(users, eq(users.id, handovers.createdBy))
    .where(eq(handovers.homeId, homeId))
    .orderBy(desc(handovers.handoverDate), desc(handovers.createdAt))
    .limit(limit);
}

/** Logs awaiting review across a home (for deputies/RM). */
export async function logsAwaitingReview(homeId: string) {
  return db
    .select({ id: dailyLogs.id, childId: dailyLogs.childId, logDate: dailyLogs.logDate, shift: dailyLogs.shift, authorName: users.fullName, childFirst: children.firstName, childLast: children.lastName })
    .from(dailyLogs)
    .innerJoin(children, eq(children.id, dailyLogs.childId))
    .leftJoin(users, eq(users.id, dailyLogs.createdBy))
    .where(and(eq(dailyLogs.homeId, homeId), eq(dailyLogs.status, "submitted")))
    .orderBy(dailyLogs.logDate);
}

/** Gaps: children with no submitted/locked log on a date in the last N days. */
export async function missingLogs(homeId: string, days = 7) {
  const today = toDate(todayLondon());
  const from = new Date(today); from.setUTCDate(from.getUTCDate() - days);
  const kids = await db.select({ id: children.id, firstName: children.firstName, lastName: children.lastName }).from(children).where(and(eq(children.homeId, homeId), isNull(children.archivedAt)));
  if (!kids.length) return [];
  const logs = await db
    .select({ childId: dailyLogs.childId, logDate: dailyLogs.logDate })
    .from(dailyLogs)
    .where(and(eq(dailyLogs.homeId, homeId), gte(dailyLogs.logDate, from), lte(dailyLogs.logDate, today), inArray(dailyLogs.status, ["submitted", "reviewed", "locked"])));
  const have = new Set(logs.map((l) => `${l.childId}:${l.logDate.toISOString().slice(0, 10)}`));
  const gaps: Array<{ childId: string; name: string; date: string }> = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() - i);
    const ymd = d.toISOString().slice(0, 10);
    for (const k of kids) if (!have.has(`${k.id}:${ymd}`)) gaps.push({ childId: k.id, name: `${k.firstName} ${k.lastName}`, date: ymd });
  }
  return gaps;
}
