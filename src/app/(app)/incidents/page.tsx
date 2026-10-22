import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { listVisibleHomes, primaryOrganisation } from "@/lib/homes/queries";
import { listIncidents } from "@/lib/incidents/queries";
import { INCIDENT_TYPE_LABEL } from "@/lib/rules/incidents";
import { can } from "@/lib/rbac";
import { StatusPill, fmtDateTime } from "@/components/record-status";

export const metadata = { title: "Incidents" };
const SEV: Record<string, string> = { low: "bg-bg text-muted", medium: "bg-amber-50 text-amber-800", high: "bg-orange-50 text-orange-800", critical: "bg-red-50 text-red-800" };

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ home?: string }> }) {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) return null;
  const sp = await searchParams;
  const homesList = await listVisibleHomes(user, org.id);
  const list = await listIncidents(user, org.id, { homeId: sp.home });
  const canCreate = homesList.some((h) => can(user.grants, "child:write", { organisationId: org.id, homeId: h.id }));
  const homeName = Object.fromEntries(homesList.map((h) => [h.id, h.name]));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>
        <div className="flex items-center gap-2">
          {homesList.length > 1 && <div className="flex gap-1 text-sm"><Link href="/incidents" className={`pill ${!sp.home ? "border-brand text-brand" : ""}`}>All</Link>{homesList.map((h) => <Link key={h.id} href={`/incidents?home=${h.id}`} className={`pill ${sp.home === h.id ? "border-brand text-brand" : ""}`}>{h.name}</Link>)}</div>}
          {canCreate && <Link href="/incidents/new" className="btn">Record an incident</Link>}
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>When</th><th>Type</th><th>Child</th><th>Home</th><th>Severity</th><th>Record</th><th>Follow-ups</th><th>By</th></tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id}>
                <td className="whitespace-nowrap"><Link href={`/incidents/${i.id}`} className="font-medium text-brand hover:underline">{fmtDateTime(i.occurredAt)}</Link></td>
                <td>{INCIDENT_TYPE_LABEL[i.type]}</td>
                <td>{i.childId ? <Link href={`/children/${i.childId}`} className="hover:underline">{i.childFirst} {i.childLast}</Link> : <span className="text-muted">Home</span>}</td>
                <td>{homeName[i.homeId]}</td>
                <td><span className={`pill ${SEV[i.severity]}`}>{i.severity}</span></td>
                <td><StatusPill status={i.status} version={i.version} /></td>
                <td>{i.openTasks === 0 ? <span className="text-ok">Complete</span> : i.overdueTasks > 0 ? <span className="text-danger">{i.overdueTasks} overdue</span> : <span>{i.openTasks} open</span>}</td>
                <td className="text-muted">{i.authorName}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={8} className="text-muted">No incidents recorded.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
