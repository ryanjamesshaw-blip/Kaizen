"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { homes, visitorsLog } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/session";
import type { ActionState } from "@/lib/children/actions";

const optText = z.string().optional().transform((s) => (s?.trim() ? s.trim() : null));

export async function signInVisitor(homeId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const [h] = await db.select().from(homes).where(eq(homes.id, homeId)).limit(1);
  if (!h) return { error: "Home not found" };
  const user = await requirePermission("child:write", { organisationId: h.organisationId, homeId });
  const parsed = z.object({ visitorName: z.string().trim().min(1, "Name is required"), organisation: optText, purpose: z.string().trim().min(1, "Purpose is required"), arrivedAt: z.string().min(1).transform((s) => new Date(s)), idChecked: z.string().optional().transform((s) => s === "on") }).safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const [v] = await db.insert(visitorsLog).values({ ...parsed.data, organisationId: h.organisationId, homeId, signedInBy: user.id }).returning({ id: visitorsLog.id });
  await audit({ organisationId: h.organisationId, homeId, actorUserId: user.id, actorRole: user.role, action: "create", entityType: "visitor", entityId: v.id, diff: { after: { visitorName: parsed.data.visitorName, purpose: parsed.data.purpose } }, ...(await requestMeta()) });
  revalidatePath(`/homes/${homeId}/visitors`);
  return { ok: true };
}

export async function signOutVisitor(id: string): Promise<void> {
  const [v] = await db.select().from(visitorsLog).where(eq(visitorsLog.id, id)).limit(1);
  if (!v || v.leftAt) return;
  const user = await requirePermission("child:write", { organisationId: v.organisationId, homeId: v.homeId });
  await db.update(visitorsLog).set({ leftAt: new Date() }).where(eq(visitorsLog.id, id));
  await audit({ organisationId: v.organisationId, homeId: v.homeId, actorUserId: user.id, actorRole: user.role, action: "update", entityType: "visitor", entityId: id, diff: { after: { left: true } }, ...(await requestMeta()) });
  revalidatePath(`/homes/${v.homeId}/visitors`);
}
