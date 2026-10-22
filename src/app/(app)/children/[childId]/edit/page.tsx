import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getChildForUser, fullName } from "@/lib/children/queries";
import { homeStaff } from "@/lib/staff/queries";
import { updateChild } from "@/lib/children/actions";
import { can } from "@/lib/rbac";
import { ActionForm } from "@/components/form";
import { ChildFields } from "@/components/child-form";

export default async function EditChildPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const user = await requireUser();
  const child = await getChildForUser(user, childId);
  if (!child) notFound();
  if (!can(user.grants, "child:write", { organisationId: child.organisationId, homeId: child.homeId }) || child.archivedAt) {
    return <p className="text-sm text-muted">This record is read-only for your role.</p>;
  }
  const staff = await homeStaff(child.homeId);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Edit record — {fullName(child)}</h1>
      <p className="text-sm text-muted">Changes to the case record are logged field by field.</p>
      <ActionForm action={updateChild.bind(null, child.id)} submitLabel="Save changes" className="space-y-6">
        <ChildFields c={child} staff={staff} />
      </ActionForm>
    </div>
  );
}
