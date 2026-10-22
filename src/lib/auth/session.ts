import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { memberships, sessions, users, type Role } from "@/db/schema";
import { primaryRole, type Grant } from "@/lib/rbac";

export const SESSION_COOKIE = "kaizen_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h absolute
const IDLE_TTL_MS = 20 * 60 * 1000; // 20 min idle on shared devices

export function hashToken(token: string): string {
  return createHash("sha256").update(token).update(process.env.SESSION_SECRET ?? "").digest("hex");
}

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  grants: Grant[];
  role: Role | null;
  sessionId: string;
};

export async function requestMeta() {
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
    userAgent: h.get("user-agent"),
  };
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const meta = await requestMeta();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    expiresAt,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  store.delete(SESSION_COOKIE);
  if (!token) return null;
  const [row] = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, hashToken(token)))
    .returning({ userId: sessions.userId });
  return row?.userId ?? null;
}

/**
 * Resolve the current user from the session cookie. Memoised per request.
 * Returns null when there is no valid session.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const now = new Date();

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!session) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > IDLE_TTL_MS) {
    await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, session.id));
    return null;
  }
  // Touch lastSeen (fire and forget).
  void db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, session.id));

  const [user] = await db.select().from(users).where(and(eq(users.id, session.userId), eq(users.active, true))).limit(1);
  if (!user) return null;

  const rows = await db.select().from(memberships).where(eq(memberships.userId, user.id));
  const grants: Grant[] = rows.map((m) => ({
    role: m.role,
    organisationId: m.organisationId,
    homeId: m.homeId,
    validFrom: m.validFrom,
    validTo: m.validTo,
    revokedAt: m.revokedAt,
  }));

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    grants,
    role: primaryRole(grants, now),
    sessionId: session.id,
  };
});
