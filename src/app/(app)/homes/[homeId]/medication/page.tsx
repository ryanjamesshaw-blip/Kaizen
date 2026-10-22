import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getVisibleHome } from "@/lib/homes/queries";
import { homeMedicationBoard } from "@/lib/operations/queries";
import { can } from "@/lib/rbac";

export default async function HomeMedicationPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = await params;
  const user = await requireUser();
  const home = await getVisibleHome(user, homeId);
  if (!home || !can(user.grants, "child:read", { organisationId: home.organisationId, homeId })) notFound();
  const meds = await homeMedicationBoard(homeId);
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted"><Link href={`/homes/${homeId}`} className="hover:underline">{home.name}</Link> · Medication</div>
      <h1 className="text-2xl font-semibold tracking-tight">Medication in the home</h1>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Child</th><th>Medication</th><th>Dose / route</th><th>When</th><th>Flags</th><th>Stock</th></tr></thead>
          <tbody>
            {meds.map(({ m, childFirst, childLast }) => (
              <tr key={m.id}><td><Link href={`/children/${m.childId}/medication`} className="font-medium text-brand hover:underline">{childFirst} {childLast}</Link></td><td>{m.name}</td><td>{m.dose} · {m.route}</td><td>{m.frequency}</td><td className="space-x-1">{m.controlledDrug && <span className="pill border-red-200 text-red-800">CD</span>}{m.prn && <span className="pill">PRN</span>}{m.homely && <span className="pill">Homely</span>}</td><td className={m.stockCount !== null && m.stockCount <= 7 ? "text-amber-700" : ""}>{m.stockCount ?? "—"}</td></tr>
            ))}
            {meds.length === 0 && <tr><td colSpan={6} className="text-muted">No current medication.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
