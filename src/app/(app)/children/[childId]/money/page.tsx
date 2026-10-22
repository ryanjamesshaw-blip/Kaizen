import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getChildForUser, fullName } from "@/lib/children/queries";
import { ledger } from "@/lib/operations/queries";
import { homeStaff } from "@/lib/staff/queries";
import { can } from "@/lib/rbac";
import { Ledger } from "@/components/ledger";

export default async function ChildMoneyPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const user = await requireUser();
  const child = await getChildForUser(user, childId);
  if (!child) notFound();
  const [rows, staff] = await Promise.all([ledger(child.homeId, childId), homeStaff(child.homeId)]);
  return (<div className="space-y-2"><div className="text-sm text-muted"><Link href={`/children/${childId}`} className="hover:underline">{fullName(child)}</Link> · Money</div>
    <Ledger homeId={child.homeId} childId={childId} rows={rows} canWrite={can(user.grants, "child:write", { organisationId: child.organisationId, homeId: child.homeId }) && !child.archivedAt} staff={staff.filter((s) => s.id !== user.id)} title={`${fullName(child)}'s money`} regulation="Schedule 3 para 7 — money and valuables held for the child." /></div>);
}
