import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./session";
import { can, type Permission } from "@/lib/rbac";

export class Forbidden extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "Forbidden";
  }
}

/** For pages: redirect to login when unauthenticated. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages and server actions: throw when the permission is missing. */
export async function requirePermission(
  permission: Permission,
  target: { organisationId: string; homeId?: string | null },
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.grants, permission, target)) throw new Forbidden(`Missing ${permission}`);
  return user;
}
