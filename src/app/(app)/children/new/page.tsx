import { requireUser } from "@/lib/auth/guard";
import { listVisibleHomes, primaryOrganisation } from "@/lib/homes/queries";
import { homeStaff } from "@/lib/staff/queries";
import { can } from "@/lib/rbac";
import { admitChild } from "@/lib/children/actions";
import { ActionForm, Area, DateInput, Section, Select } from "@/components/form";
import { ChildFields } from "@/components/child-form";

export const metadata = { title: "Admit a child" };

export default async function NewChildPage({ searchParams }: { searchParams: Promise<{ home?: string }> }) {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) return null;
  const homesList = (await listVisibleHomes(user, org.id)).filter((h) => can(user.grants, "child:write", { organisationId: org.id, homeId: h.id }));
  if (homesList.length === 0) return <p className="text-sm text-muted">Your role cannot admit children.</p>;
  const { home } = await searchParams;
  const chosen = homesList.find((h) => h.id === home) ?? homesList[0];
  const staff = await homeStaff(chosen.id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Admit a child</h1>
      <p className="text-sm text-muted">Creates the child&apos;s case record (Regulation 36) and opens their placement. Everything can be completed later; only name, date of birth and admission date are required now.</p>
      <ActionForm action={admitChild} submitLabel="Admit and open record" className="space-y-6">
        <Section title="Placement" description="Regulation 41 — Ofsted and the placing authority must be notified of admissions">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select name="homeId" label="Home" defaultValue={chosen.id} options={homesList.map((h): [string, string] => [h.id, h.name])} />
            <DateInput name="admittedOn" label="Admission date" defaultValue={new Date()} required />
            <DateInput name="plannedEndOn" label="Planned end date (if known)" />
            <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" name="emergency" />Emergency placement</label>
          </div>
          <Area name="reasonForPlacement" label="Reason for placement" rows={2} />
        </Section>
        <ChildFields staff={staff} />
      </ActionForm>
    </div>
  );
}
