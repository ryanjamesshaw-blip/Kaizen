"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guard";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { homes } from "@/db/schema";
import { runEngineForHome } from "./run";

export async function runChecksNow(homeId: string): Promise<void> {
  const [h] = await db.select().from(homes).where(eq(homes.id, homeId)).limit(1);
  if (!h) return;
  const user = await requirePermission("home:manage", { organisationId: h.organisationId, homeId });
  await runEngineForHome(homeId, user.id);
  revalidatePath(`/rules`); revalidatePath(`/tasks`); revalidatePath(`/homes/${homeId}`); revalidatePath(`/`);
}
