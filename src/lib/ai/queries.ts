import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiDrafts, users } from "@/db/schema";

export async function draftsFor(target: "reg45_review" | "chronology_summary" | "log_feedback" | "mock_inspection", targetId: string) {
  const [drafts, names] = await Promise.all([
    db.select().from(aiDrafts).where(and(eq(aiDrafts.target, target), eq(aiDrafts.targetId, targetId))).orderBy(desc(aiDrafts.createdAt)).limit(10),
    db.select({ id: users.id, n: users.fullName }).from(users).then((r) => Object.fromEntries(r.map((u) => [u.id, u.n]))),
  ]);
  return { drafts, names };
}
