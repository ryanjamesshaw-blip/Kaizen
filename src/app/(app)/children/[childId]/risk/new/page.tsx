import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getChildForUser, fullName } from "@/lib/children/queries";
import { createRiskAssessment } from "@/lib/children/actions";
import { can } from "@/lib/rbac";
import { ActionForm } from "@/components/form";
import { RiskFields } from "@/components/risk-fields";

export default async function NewRiskPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const user = await requireUser();
  const child = await getChildForUser(user, childId);
  if (!child) notFound();
  if (!can(user.grants, "child:write", { organisationId: child.organisationId, homeId: child.homeId })) return <p className="text-sm text-muted">Read-only for your role.</p>;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="text-sm text-muted"><Link href={`/children/${child.id}`} className="hover:underline">{fullName(child)}</Link> · New risk assessment</div>
      <h1 className="text-2xl font-semibold tracking-tight">New risk assessment</h1>
      <div className="card">
        <ActionForm action={createRiskAssessment.bind(null, child.id)} submitLabel="Save draft">
          <RiskFields />
        </ActionForm>
      </div>
    </div>
  );
}
