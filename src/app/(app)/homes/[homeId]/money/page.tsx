import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getVisibleHome } from "@/lib/homes/queries";
import { ledger } from "@/lib/operations/queries";
import { homeStaff } from "@/lib/staff/queries";
import { can } from "@/lib/rbac";
import { Ledger } from "@/components/ledger";

export default async function HomeMoneyPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = await params;
  const user = await requireUser();
  const home = await getVisibleHome(user, homeId);
  if (!home) notFound();
  const [rows, staff] = await Promise.all([ledger(homeId, null), homeStaff(homeId)]);
  return (<div className="space-y-2"><div className="text-sm text-muted"><Link href={`/homes/${homeId}`} className="hover:underline">{home.name}</Link> · Petty cash</div>
    <Ledger homeId={homeId} childId={null} rows={rows} canWrite={can(user.grants, "child:write", { organisationId: home.organisationId, homeId })} staff={staff.filter((s) => s.id !== user.id)} title={`Petty cash — ${home.name}`} regulation="Reg 47, Schedule 4 para 7 — every payment needs a receipt." /></div>);
}
