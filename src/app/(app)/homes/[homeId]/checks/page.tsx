import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getVisibleHome } from "@/lib/homes/queries";
import { checksBoard } from "@/lib/operations/queries";
import { addCheckType, recordCheck, seedDefaultChecks } from "@/lib/operations/actions";
import { can } from "@/lib/rbac";
import { ActionForm, DateInput, Text } from "@/components/form";
import { fmtDate } from "@/components/record-status";
import { nowMs } from "@/lib/time";

const ST: Record<string, string> = { ok: "text-ok", due_soon: "text-amber-700", overdue: "text-danger" };

export default async function ChecksPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = await params;
  const user = await requireUser();
  const home = await getVisibleHome(user, homeId);
  if (!home) notFound();
  const scope = { organisationId: home.organisationId, homeId };
  const canWrite = can(user.grants, "child:write", scope);
  const canManage = can(user.grants, "home:manage", scope);
  const now = new Date(nowMs());
  const board = await checksBoard(homeId, now);
  const overdue = board.filter((b) => b.status === "overdue").length;
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted"><Link href={`/homes/${homeId}`} className="hover:underline">{home.name}</Link> · Checks</div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Safety checks and fire</h1><p className="text-sm text-muted">Reg 25, Reg 46, Schedule 4 para 6. {overdue ? <span className="text-danger">{overdue} overdue.</span> : board.length ? "All in date." : ""}</p></div>
        {canManage && board.length === 0 && <form action={seedDefaultChecks.bind(null, homeId)}><button className="btn" type="submit">Set up the standard schedule</button></form>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {board.map(({ type, last, dueOn, status }) => (
          <div key={type.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-medium">{type.name}</div><div className="text-xs text-muted">Every {type.frequencyDays >= 365 ? `${Math.round(type.frequencyDays / 365)} yr` : `${type.frequencyDays} days`} · {type.regulation}</div></div>
              <div className={`text-right text-sm ${ST[status]}`}>{status === "overdue" ? "Overdue" : status === "due_soon" ? "Due soon" : "OK"}<div className="text-xs">due {fmtDate(dueOn)}</div></div>
            </div>
            <div className="mt-2 text-sm text-muted">{last ? <>Last {fmtDate(last.checkedOn)} · {last.passed ? <span className="text-ok">passed</span> : <span className="text-danger">failed: {last.findings}</span>}{last.actionTaken ? ` · ${last.actionTaken}` : ""}</> : "Never recorded"}</div>
            {canWrite && (
              <details className="mt-2 text-sm"><summary className="cursor-pointer text-brand">Record check</summary>
                <div className="mt-2"><ActionForm action={recordCheck.bind(null, type.id)} submitLabel="Record" successMessage="Recorded.">
                  <div className="grid gap-3 sm:grid-cols-2"><DateInput name="checkedOn" label="Date" defaultValue={now} required /><div><label className="label">Result</label><div className="flex gap-4 pt-2"><label className="flex items-center gap-1"><input type="radio" name="passed" value="yes" defaultChecked />Pass</label><label className="flex items-center gap-1"><input type="radio" name="passed" value="no" />Fail</label></div></div></div>
                  <Text name="findings" label="Findings (required if failed)" /><Text name="actionTaken" label="Action taken" />
                </ActionForm></div>
              </details>
            )}
          </div>
        ))}
      </div>
      {canManage && board.length > 0 && (
        <details className="card text-sm"><summary className="cursor-pointer font-semibold">Add a check type</summary>
          <div className="mt-3"><ActionForm action={addCheckType.bind(null, homeId)} submitLabel="Add" successMessage="Added."><div className="grid gap-3 sm:grid-cols-3"><Text name="name" label="Name" required /><Text name="frequencyDays" label="Every (days)" type="number" required /><Text name="regulation" label="Regulation / reason" /></div></ActionForm></div>
        </details>
      )}
    </div>
  );
}
