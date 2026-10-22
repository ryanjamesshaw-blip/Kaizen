import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";

/** Active staff (any care role) attached to a home — for key-worker pickers. */
export async function homeStaff(homeId: string) {
  return db
    .select({ id: users.id, fullName: users.fullName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.homeId, homeId), isNull(memberships.revokedAt), inArray(memberships.role, ["registered_manager", "deputy", "care_worker"])))
    .orderBy(users.fullName);
}
