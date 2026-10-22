import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getVisibleHome } from "@/lib/homes/queries";
import { staffCompliance } from "@/lib/operations/queries";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { fmtDate } from "@/components/record-status";
import { nowMs } from "@/lib/time";

const SUP: Record<string, string> = { ok: "text-ok", due_soon: "text-amber-700", overdue: "text-danger", never: "text-danger" };

export default async function TeamPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = await params;
  const user = await requireUser();
  const home = await getVisibleHome(user, homeId);
  if (!home || !can(user.grants, "staff:read", { organisationId: home.organisationId, homeId })) notFound();
  const rows = await staffCompliance(home.organisationId, homeId, new Date(nowMs()));
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted"><Link href={`/homes/${homeId}`} className="hover:underline">{home.name}</Link> · Team compliance</div>
      <h1 className="text-2xl font-semibold tracking-tight">Team — {home.name}</h1>
      <p className="text-sm text-muted">Schedule 2 fitness, supervision (Reg 33), qualifications (Reg 32), training. Click a name for the full record.</p>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Role</th><th>Sch 2 file</th><th>DBS</th><th>Level 3</th><th>Supervision</th><th>Appraisal</th><th>Training</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId}>
                <td><Link href={`/staff/${r.userId}`} className="font-medium text-brand hover:underline">{r.fullName}</Link></td>
                <td>{ROLE_LABELS[r.role]}</td>
                <td>{r.schedule2Missing.length === 0 ? <span className="text-ok">Complete</span> : <span className="text-danger">{r.schedule2Missing.length} missing</span>}</td>
                <td className={r.dbs === "ok" ? "text-ok" : "text-danger"}>{r.dbs === "ok" ? "OK" : r.dbs === "renew" ? "Renew (3y+)" : "Missing"}</td>
                <td className={r.level3 === "achieved" ? "text-ok" : r.level3 === "overdue" ? "text-danger" : "text-amber-700"}>{r.level3 === "achieved" ? "Achieved" : r.level3 === "within_window" ? "In 2-year window" : r.level3 === "overdue" ? "Overdue" : "No start date"}</td>
                <td className={SUP[r.supervisionStatus]}>{r.lastSupervision ? fmtDate(r.lastSupervision) : "Never"} <span className="text-xs">· due {fmtDate(r.supervisionDue)}</span></td>
                <td>{r.lastAppraisal ? fmtDate(r.lastAppraisal) : <span className="text-amber-700">None</span>}</td>
                <td>{r.training.expired > 0 ? <span className="text-danger">{r.training.expired} expired</span> : r.training.mandatoryMissing.length > 0 ? <span className="text-amber-700">{r.training.mandatoryMissing.length} mandatory missing</span> : <span className="text-ok">Up to date</span>}{r.training.expiring > 0 && <span className="text-xs text-amber-700"> · {r.training.expiring} expiring</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="text-muted">No care staff attached to this home.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
