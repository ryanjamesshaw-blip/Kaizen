import { requireUser } from "@/lib/auth/guard";
import { listVisibleHomes, primaryOrganisation } from "@/lib/homes/queries";
import { listVisibleChildren, fullName } from "@/lib/children/queries";
import { can } from "@/lib/rbac";
import { IncidentForm } from "@/components/incident-form";
import type { IncidentType } from "@/db/schema";

export const metadata = { title: "Record an incident" };

export default async function NewIncidentPage({ searchParams }: { searchParams: Promise<{ home?: string; child?: string; type?: string }> }) {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) return null;
  const sp = await searchParams;
  const homesList = (await listVisibleHomes(user, org.id)).filter((h) => can(user.grants, "child:write", { organisationId: org.id, homeId: h.id }));
  if (homesList.length === 0) return <p className="text-sm text-muted">Your role cannot record incidents.</p>;
  const kids = await listVisibleChildren(user, org.id);
  const homes = homesList.map((h) => ({ id: h.id, name: h.name, kids: kids.filter((k) => k.homeId === h.id).map((k) => ({ id: k.id, name: fullName(k) })) }));
  const initialHome = sp.child ? kids.find((k) => k.id === sp.child)?.homeId ?? homesList[0].id : homesList.find((h) => h.id === sp.home)?.id ?? homesList[0].id;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Record an incident</h1>
      <p className="text-sm text-muted">Submitting creates the follow-up tasks for this type of incident with owners and deadlines. Record it as soon as you can; corrections go through the manager.</p>
      <IncidentForm homes={homes} initialHome={initialHome} initialChild={sp.child} initialType={sp.type as IncidentType | undefined} />
    </div>
  );
}
