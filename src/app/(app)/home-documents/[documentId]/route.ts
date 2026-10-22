import { eq } from "drizzle-orm";
import { db } from "@/db";
import { homeDocuments } from "@/db/schema";
import { getCurrentUser, requestMeta } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { can } from "@/lib/rbac";

export async function GET(_req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  const { documentId } = await params;
  const [doc] = await db.select().from(homeDocuments).where(eq(homeDocuments.id, documentId)).limit(1);
  if (!doc || !doc.content || !can(user.grants, "home:read", { organisationId: doc.organisationId, homeId: doc.homeId })) return new Response("Not found", { status: 404 });
  await audit({ organisationId: doc.organisationId, homeId: doc.homeId, actorUserId: user.id, actorRole: user.role, action: "read", entityType: "home_document", entityId: doc.id, ...(await requestMeta()) });
  return new Response(new Uint8Array(doc.content), { headers: { "Content-Type": doc.mimeType ?? "application/octet-stream", "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName ?? "document")}"`, "Cache-Control": "private, no-store" } });
}
