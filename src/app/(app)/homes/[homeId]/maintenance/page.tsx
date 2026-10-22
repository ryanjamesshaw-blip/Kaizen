import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getVisibleHome } from "@/lib/homes/queries";
import { maintenanceList } from "@/lib/operations/queries";
import { addMaintenance, resolveMaintenance } from "@/lib/operations/actions";
import { can } from "@/lib/rbac";
import { ActionForm, Area, DateInput, Select, Text } from "@/components/form";
import { fmtDate } from "@/components/record-status";

export default async function MaintenancePage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = await params;
  const user = await requireUser();
  const home = await getVisibleHome(user, homeId);
  if (!home) notFound();
  const canWrite = can(user.grants, "child:write", { organisationId: home.organisationId, homeId });
  const items = await maintenanceList(homeId);
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted"><Link href={`/homes/${homeId}`} className="hover:underline">{home.name}</Link> · Maintenance</div>
      <h1 className="text-2xl font-semibold tracking-tight">Maintenance <span className="text-base font-normal text-muted">(Reg 46)</span></h1>
      {canWrite && (
        <details className="card text-sm" open={items.length === 0}><summary className="cursor-pointer font-semibold">Report a problem</summary>
          <div className="mt-3"><ActionForm action={addMaintenance.bind(null, homeId)} submitLabel="Report" successMessage="Reported.">
            <div className="grid gap-3 sm:grid-cols-3"><DateInput name="reportedOn" label="Date" defaultValue={new Date()} required /><Text name="location" label="Where" /><Select name="priority" label="Priority" options={[["routine", "Routine"], ["urgent", "Urgent"]]} /></div>
            <Area name="description" label="What's wrong" rows={2} required /><label className="flex items-center gap-2"><input type="checkbox" name="safetyRisk" />Poses a safety risk to children or staff</label>
          </ActionForm></div>
        </details>
      )}
      <div className="card">
        <table className="table">
          <thead><tr><th>Reported</th><th>Where</th><th>Problem</th><th>Priority</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {items.map(({ m, reporter }) => (
              <tr key={m.id} className={m.status === "done" ? "opacity-60" : m.safetyRisk ? "bg-red-50" : ""}>
                <td className="whitespace-nowrap">{fmtDate(m.reportedOn)}<div className="text-xs text-muted">{reporter}</div></td><td>{m.location}</td><td>{m.description}{m.resolution && <div className="text-xs text-muted">Resolved: {m.resolution}</div>}</td>
                <td><span className={`pill ${m.priority === "urgent" ? "border-red-200 text-red-800" : ""}`}>{m.priority}</span>{m.safetyRisk && <span className="pill ml-1 border-red-200 text-red-800">safety</span>}</td>
                <td>{m.status === "done" ? `Done ${fmtDate(m.resolvedOn)}` : m.status.replace("_", " ")}</td>
                <td>{canWrite && m.status !== "done" && <form action={resolveMaintenance.bind(null, m.id)} className="flex items-center gap-1"><input name="resolution" placeholder="What was done" className="input w-40 py-1 text-xs" /><button name="intent" value="progress" className="btn-ghost py-1 text-xs">In progress</button><button name="intent" value="done" className="btn py-1 text-xs">Done</button></form>}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="text-muted">Nothing reported.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
