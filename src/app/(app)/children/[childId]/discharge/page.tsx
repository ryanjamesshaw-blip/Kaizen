import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getChildForUser, fullName } from "@/lib/children/queries";
import { dischargeChild } from "@/lib/children/actions";
import { can } from "@/lib/rbac";
import { ActionForm, Area, DateInput, Select, Text } from "@/components/form";

export default async function DischargePage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const user = await requireUser();
  const child = await getChildForUser(user, childId);
  if (!child) notFound();
  if (!can(user.grants, "record:review", { organisationId: child.organisationId, homeId: child.homeId })) return <p className="text-sm text-muted">Only a deputy or manager can end a placement.</p>;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">End placement — {fullName(child)}</h1>
      <p className="text-sm text-muted">Schedule 3 paragraph 6 requires the address and type of accommodation the child moves to. The record is retained and becomes read-only.</p>
      <ActionForm action={dischargeChild.bind(null, child.id)} submitLabel="End placement">
        <DateInput name="dischargedOn" label="Date of leaving" defaultValue={new Date()} required />
        <Text name="dischargeDestination" label="Where the child has moved to (address)" required />
        <Select name="dischargeDestinationType" label="Type of accommodation" options={[["family", "Returned to family"], ["foster", "Foster care"], ["childrens_home", "Another children's home"], ["supported", "Supported accommodation"], ["independent", "Independent living"], ["secure", "Secure accommodation"], ["custody", "Custody"], ["other", "Other"]]} />
        <Area name="dischargeReason" label="Reason for ending" rows={3} />
      </ActionForm>
    </div>
  );
}
