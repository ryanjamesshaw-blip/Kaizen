"use server";

import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { createSession, destroySession, getCurrentUser, requestMeta } from "./session";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type LoginState = { error?: string; email?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const meta = await requestMeta();
  if (!parsed.success) return { error: "Enter your email and password.", email: String(formData.get("email") ?? "") };
  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email}`, eq(users.active, true)))
    .limit(1);

  const generic = { error: "Email or password is incorrect.", email };

  if (!user) {
    await audit({ action: "login_failed", entityType: "user", entityId: email, ...meta });
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await audit({ action: "login_failed", entityType: "user", entityId: user.id, reason: "locked", ...meta });
    return { error: "This account is temporarily locked. Try again in a few minutes.", email };
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await db
      .update(users)
      .set({
        failedLoginCount: failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      })
      .where(eq(users.id, user.id));
    await audit({ action: "login_failed", entityType: "user", entityId: user.id, ...meta });
    return generic;
  }

  await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));
  await createSession(user.id);
  await audit({ actorUserId: user.id, action: "login", entityType: "user", entityId: user.id, ...meta });
  redirect("/");
}

export async function logout(): Promise<void> {
  const current = await getCurrentUser();
  const meta = await requestMeta();
  const userId = await destroySession();
  if (userId) {
    await audit({ actorUserId: userId, actorRole: current?.role ?? null, action: "logout", entityType: "user", entityId: userId, ...meta });
  }
  redirect("/login");
}
