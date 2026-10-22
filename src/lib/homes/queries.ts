import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { homes, memberships, organisations, users } from "@/db/schema";
import { visibleHomes } from "@/lib/rbac";
import type { CurrentUser } from "@/lib/auth/session";

/** Organisations the user holds any active grant in. */
export function userOrganisationIds(user: CurrentUser): string[] {
  return [...new Set(user.grants.filter((g) => !g.revokedAt).map((g) => g.organisationId))];
}

/** The user's primary organisation (slice 1: one org per user). */
export async function primaryOrganisation(user: CurrentUser) {
  const [orgId] = userOrganisationIds(user);
  if (!orgId) return null;
  const [org] = await db.select().from(organisations).where(eq(organisations.id, orgId)).limit(1);
  return org ?? null;
}

/** Homes this user may see, enforcing scope from grants, not from the UI. */
export async function listVisibleHomes(user: CurrentUser, organisationId: string) {
  const scope = visibleHomes(user.grants, organisationId);
  if (scope !== "all" && scope.length === 0) return [];
  const where =
    scope === "all"
      ? eq(homes.organisationId, organisationId)
      : and(eq(homes.organisationId, organisationId), inArray(homes.id, scope));
  return db.select().from(homes).where(where).orderBy(homes.name);
}

export async function getVisibleHome(user: CurrentUser, homeId: string) {
  const [home] = await db.select().from(homes).where(eq(homes.id, homeId)).limit(1);
  if (!home) return null;
  const scope = visibleHomes(user.grants, home.organisationId);
  if (scope !== "all" && !scope.includes(home.id)) return null;
  return home;
}

export type StaffRow = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  role: (typeof memberships.$inferSelect)["role"];
  homeId: string | null;
  homeName: string | null;
  validFrom: Date;
  validTo: Date | null;
  revokedAt: Date | null;
  lastLoginAt: Date | null;
};

/** All memberships in the organisation, restricted to homes the user can see. */
export async function listStaff(user: CurrentUser, organisationId: string): Promise<StaffRow[]> {
  const scope = visibleHomes(user.grants, organisationId);
  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      fullName: users.fullName,
      email: users.email,
      role: memberships.role,
      homeId: memberships.homeId,
      homeName: homes.name,
      validFrom: memberships.validFrom,
      validTo: memberships.validTo,
      revokedAt: memberships.revokedAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(homes, eq(homes.id, memberships.homeId))
    .where(eq(memberships.organisationId, organisationId))
    .orderBy(users.fullName);
  if (scope === "all") return rows;
  return rows.filter((r) => r.homeId && scope.includes(r.homeId));
}
