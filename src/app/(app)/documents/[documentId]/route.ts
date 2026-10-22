import { getCurrentUser } from "@/lib/auth/session";
import { getDocumentForUser } from "@/lib/children/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });
  const { documentId } = await params;
  const doc = await getDocumentForUser(user, documentId);
  if (!doc) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(doc.content), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
