import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { listVisibleChildren, ageOn, fullName } from "@/lib/children/queries";
import { listVisibleHomes, primaryOrganisation } from "@/lib/homes/queries";
import { can } from "@/lib/rbac";
import { LEGAL_LABEL } from "@/components/child-form";

export const metadata = { title: "Children" };

export default async function ChildrenPage() {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) return null;
  const [list, homesList] = await Promise.all([listVisibleChildren(user, org.id), listVisibleHomes(user, org.id)]);
  const canAdmit = homesList.some((h) => can(user.grants, "child:write", { organisationId: org.id, homeId: h.id }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Children</h1>
        {canAdmit && <Link href="/children/new" className="btn">Admit a child</Link>}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Age</th><th>Home</th><th>Legal status</th><th>Placing authority</th><th>Key worker</th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/children/${c.id}`} className="font-medium text-brand hover:underline">{fullName(c)}</Link></td>
                <td>{ageOn(c.dateOfBirth)}</td>
                <td>{c.homeName}</td>
                <td>{LEGAL_LABEL[c.legalStatus]}</td>
                <td>{c.placingAuthority ?? "—"}</td>
                <td>{c.keyWorkerName ?? <span className="text-muted">Not assigned</span>}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="text-muted">No children placed in the homes you can see.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
