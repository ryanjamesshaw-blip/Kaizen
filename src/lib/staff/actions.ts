"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import { homes, memberships, users, roleEnum } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requirePermission, requireUser } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/session";
import { isOrgScope, can } from "@/lib/rbac";
import type { ActionState } from "@/lib/children/actions";

const grantSchema = z.object({
  organisationId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  fullName: z.string().trim().min(1, "Name is required"),
  role: z.enum(roleEnum.enumValues),
  homeId: z.string().uuid().optional().or(z.literal("")),
  validTo: z.string().optional(),
});

/**
 * Grant access: creates the user if they don't exist (with a temporary
 * password returned once), then adds a membership. Org-scope roles need
 * org:manage; home-scope roles need access:grant on that home.
 */
export async function grantAccess(_p: ActionState, fd: FormData): Promise<ActionState & { tempPassword?: string }> {
  const parsed = grantSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const { organisationId, email, fullName, role } = parsed.data;
  const homeId = parsed.data.homeId || null;
  const validTo = parsed.data.validTo ? new Date(`${parsed.data.validTo}T23:59:59Z`) : null;

  if (isOrgScope(role)) {
    if (homeId) return { error: "Organisation-wide roles are not tied to a home" };
    await requirePermission("org:manage", { organisationId });
  } else {
    if (!homeId) return { error: "Choose a home for this role" };
    const [home] = await db.select().from(homes).where(and(eq(homes.id, homeId), eq(homes.organisationId, organisationId))).limit(1);
    if (!home) return { error: "Home not found" };
    await requirePermission("access:grant", { organisationId, homeId });
  }
  if ((role === "inspector" || role === "independent_visitor") && !validTo) {
    return { error: "Inspector and independent visitor access must have an end date" };
  }
  const user = await requireUser();
  const meta = await requestMeta();

  let [target] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  let tempPassword: string | undefined;
  if (!target) {
    tempPassword = randomBytes(9).toString("base64url");
    [target] = await db.insert(users).values({ email, fullName, passwordHash: await bcrypt.hash(tempPassword, 12) }).returning();
    await audit({ organisationId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "user", entityId: target.id, diff: { after: { email, fullName } }, ...meta });
  }

  const [m] = await db
    .insert(memberships)
    .values({ userId: target.id, organisationId, homeId, role, validTo, grantedBy: user.id })
    .returning({ id: memberships.id });
  await audit({
    organisationId, homeId, actorUserId: user.id, actorRole: user.role, action: "grant_access",
    entityType: "membership", entityId: m.id, diff: { after: { user: target.id, role, homeId, validTo } }, ...meta,
  });
  revalidatePath("/staff");
  return { ok: true, tempPassword };
}

export async function revokeAccess(membershipId: string, fd: FormData): Promise<void> {
  const [m] = await db.select().from(memberships).where(eq(memberships.id, membershipId)).limit(1);
  if (!m || m.revokedAt) return;
  const user = isOrgScope(m.role)
    ? await requirePermission("org:manage", { organisationId: m.organisationId })
    : await requirePermission("access:grant", { organisationId: m.organisationId, homeId: m.homeId });
  if (m.userId === user.id) throw new Error("You cannot revoke your own access");
  const reason = String(fd.get("reason") ?? "").trim();
  await db.update(memberships).set({ revokedAt: new Date(), revokedBy: user.id }).where(eq(memberships.id, membershipId));
  await audit({
    organisationId: m.organisationId, homeId: m.homeId, actorUserId: user.id, actorRole: user.role,
    action: "revoke_access", entityType: "membership", entityId: membershipId, reason: reason || null, ...(await requestMeta()),
  });
  revalidatePath("/staff");
}

export async function changePassword(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z
    .object({ current: z.string().min(1), next: z.string().min(12, "Use at least 12 characters"), confirm: z.string() })
    .refine((d) => d.next === d.confirm, { message: "New passwords do not match", path: ["confirm"] })
    .safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!(await bcrypt.compare(parsed.data.current, row.passwordHash))) return { error: "Current password is incorrect" };
  await db.update(users).set({ passwordHash: await bcrypt.hash(parsed.data.next, 12), updatedAt: new Date() }).where(eq(users.id, user.id));
  await audit({ actorUserId: user.id, actorRole: user.role, action: "update", entityType: "user", entityId: user.id, diff: { after: { password: "changed" } }, ...(await requestMeta()) });
  return { ok: true };
}

export async function canManageAnyAccess(user: Awaited<ReturnType<typeof requireUser>>, organisationId: string, homeIds: string[]) {
  return can(user.grants, "org:manage", { organisationId }) || homeIds.some((h) => can(user.grants, "access:grant", { organisationId, homeId: h }));
}
