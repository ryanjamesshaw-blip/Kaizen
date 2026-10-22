import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getChildForUser, fullName } from "@/lib/children/queries";
import { createKeywork } from "@/lib/daily/actions";
import { can } from "@/lib/rbac";
import { SaveOrSubmitForm } from "@/components/save-or-submit";
import { KeyworkFields } from "@/components/keywork-fields";

export default async function NewKeyworkPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const user = await requireUser();
  const child = await getChildForUser(user, childId);
  if (!child) notFound();
  if (!can(user.grants, "child:write", { organisationId: child.organisationId, homeId: child.homeId }) || child.archivedAt) return <p className="text-sm text-muted">Read-only for your role.</p>;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="text-sm text-muted"><Link href={`/children/${child.id}/daily`} className="hover:underline">{fullName(child)}</Link> · Key-work</div>
      <h1 className="text-2xl font-semibold tracking-tight">Key-work session — {fullName(child)}</h1>
      <div className="card"><SaveOrSubmitForm action={createKeywork.bind(null, child.id)} draftKey={`keywork:${child.id}`}><KeyworkFields /></SaveOrSubmitForm></div>
    </div>
  );
}
