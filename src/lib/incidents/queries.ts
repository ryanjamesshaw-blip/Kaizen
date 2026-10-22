import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { children, followUpTasks, incidents, missingEpisodes, notifications, physicalInterventions, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requestMeta, type CurrentUser } from "@/lib/auth/session";
import { can, visibleHomes, isOrgScope } from "@/lib/rbac";

export async function listIncidents(user: CurrentUser, organisationId: string, opts: { homeId?: string; childId?: string; limit?: number } = {}) {
  const scope = visibleHomes(user.grants, organisationId);
  if (scope !== "all" && scope.length === 0) return [];
  const conds = [eq(incidents.organisationId, organisationId), sql`${incidents.id} NOT IN (SELECT supersedes_id FROM incidents WHERE supersedes_id IS NOT NULL)`];
  if (scope !== "all") conds.push(inArray(incidents.homeId, scope));
  if (opts.homeId) conds.push(eq(incidents.homeId, opts.homeId));
  if (opts.childId) conds.push(eq(incidents.childId, opts.childId));
  const rows = await db
    .select({
      id: incidents.id, type: incidents.type, severity: incidents.severity, occurredAt: incidents.occurredAt, status: incidents.status, version: incidents.version,
      homeId: incidents.homeId, childId: incidents.childId, childFirst: children.firstName, childLast: children.lastName, authorName: users.fullName,
      openTasks: sql<number>`(SELECT count(*) FROM follow_up_tasks t WHERE t.incident_id = ${incidents.id} AND t.status = 'open')`.mapWith(Number),
      overdueTasks: sql<number>`(SELECT count(*) FROM follow_up_tasks t WHERE t.incident_id = ${incidents.id} AND t.status = 'open' AND t.due_at < now())`.mapWith(Number),
    })
    .from(incidents)
    .leftJoin(children, eq(children.id, incidents.childId))
    .leftJoin(users, eq(users.id, incidents.createdBy))
    .where(and(...conds))
    .orderBy(desc(incidents.occurredAt))
    .limit(opts.limit ?? 200);
  return rows.filter((r) => can(user.grants, "child:read", { organisationId, homeId: r.homeId }));
}

export async function getIncidentBundle(user: CurrentUser, id: string) {
  const [inc] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  if (!inc) return null;
  if (!can(user.grants, "child:read", { organisationId: inc.organisationId, homeId: inc.homeId })) return null;
  await audit({ organisationId: inc.organisationId, homeId: inc.homeId, actorUserId: user.id, actorRole: user.role, action: "read", entityType: "incident", entityId: inc.id, ...(await requestMeta()) });
  const [child, pi, missing, notes, tasks, newer, older, names] = await Promise.all([
    inc.childId ? db.select().from(children).where(eq(children.id, inc.childId)).limit(1).then((r) => r[0] ?? null) : null,
    db.select().from(physicalInterventions).where(eq(physicalInterventions.incidentId, inc.id)).limit(1).then((r) => r[0] ?? null),
    db.select().from(missingEpisodes).where(eq(missingEpisodes.incidentId, inc.id)).limit(1).then((r) => r[0] ?? null),
    db.select().from(notifications).where(eq(notifications.incidentId, inc.id)).orderBy(notifications.sentAt),
    db.select({ t: followUpTasks, ownerName: users.fullName }).from(followUpTasks).leftJoin(users, eq(users.id, followUpTasks.ownerUserId)).where(eq(followUpTasks.incidentId, inc.id)).orderBy(asc(followUpTasks.dueAt)),
    db.select({ id: incidents.id, version: incidents.version }).from(incidents).where(eq(incidents.supersedesId, inc.id)).limit(1).then((r) => r[0] ?? null),
    inc.supersedesId ? db.select({ id: incidents.id, version: incidents.version }).from(incidents).where(eq(incidents.id, inc.supersedesId)).limit(1).then((r) => r[0] ?? null) : null,
    db.select({ id: users.id, n: users.fullName }).from(users).then((r) => Object.fromEntries(r.map((u) => [u.id, u.n]))),
  ]);
  return { inc, child, pi, missing, notes, tasks, newer, older, names };
}

/** Open follow-up tasks visible to this user: by home scope, highlighting ones for their role or them personally. */
export async function listOpenTasks(user: CurrentUser, organisationId: string, homeId?: string) {
  const scope = visibleHomes(user.grants, organisationId);
  if (scope !== "all" && scope.length === 0) return [];
  const conds = [eq(followUpTasks.organisationId, organisationId), eq(followUpTasks.status, "open")];
  if (scope !== "all") conds.push(inArray(followUpTasks.homeId, scope));
  if (homeId) conds.push(eq(followUpTasks.homeId, homeId));
  const rows = await db
    .select({ t: followUpTasks, childFirst: children.firstName, childLast: children.lastName, incidentType: incidents.type })
    .from(followUpTasks)
    .leftJoin(children, eq(children.id, followUpTasks.childId))
    .leftJoin(incidents, eq(incidents.id, followUpTasks.incidentId))
    .where(and(...conds))
    .orderBy(asc(followUpTasks.dueAt));
  return rows.filter((r) => can(user.grants, "child:read", { organisationId, homeId: r.t.homeId }));
}

/** Does this task "belong" to the user — their role (or a senior role) in that home, or them by name? */
export function taskIsMine(user: CurrentUser, t: { ownerRole: string | null; ownerUserId: string | null; homeId: string; organisationId: string }) {
  if (t.ownerUserId) return t.ownerUserId === user.id;
  if (!t.ownerRole) return false;
  const order = ["care_worker", "deputy", "registered_manager", "responsible_individual", "director"];
  const want = order.indexOf(t.ownerRole);
  return user.grants.some((g) => {
    if (g.revokedAt || g.organisationId !== t.organisationId) return false;
    if (!isOrgScope(g.role) && g.homeId !== t.homeId) return false;
    const have = order.indexOf(g.role);
    return have >= 0 && have >= want && have - want <= 1; // own role or one above
  });
}

export async function homeIncidentSummary(homeId: string) {
  const [row] = await db
    .select({
      open: sql<number>`count(*) filter (where ${incidents.status} <> 'locked')`.mapWith(Number),
      last30: sql<number>`count(*) filter (where ${incidents.occurredAt} > now() - interval '30 days')`.mapWith(Number),
      pi30: sql<number>`count(*) filter (where ${incidents.type} = 'physical_intervention' and ${incidents.occurredAt} > now() - interval '30 days')`.mapWith(Number),
      missing30: sql<number>`count(*) filter (where ${incidents.type} = 'missing' and ${incidents.occurredAt} > now() - interval '30 days')`.mapWith(Number),
    })
    .from(incidents)
    .where(and(eq(incidents.homeId, homeId), isNull(incidents.supersedesId)));
  const [tasks] = await db
    .select({
      open: sql<number>`count(*)`.mapWith(Number),
      overdue: sql<number>`count(*) filter (where ${followUpTasks.dueAt} < now())`.mapWith(Number),
    })
    .from(followUpTasks)
    .where(and(eq(followUpTasks.homeId, homeId), eq(followUpTasks.status, "open")));
  return { ...row, tasksOpen: tasks.open, tasksOverdue: tasks.overdue };
}

