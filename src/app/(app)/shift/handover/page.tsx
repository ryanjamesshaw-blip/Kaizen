import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { listVisibleHomes, primaryOrganisation } from "@/lib/homes/queries";
import { shiftBoard, todayLondon, currentShift, recentHandovers } from "@/lib/daily/queries";
import { saveHandover } from "@/lib/daily/actions";
import { can } from "@/lib/rbac";
import { fullName } from "@/lib/children/queries";
import { ActionForm, Area, DateInput, Select, Text } from "@/components/form";
import { DraftRecovery } from "@/components/draft-recovery";
import { SHIFTS, SHIFT_LABEL } from "@/components/daily-log-fields";
import { fmtDate } from "@/components/record-status";

const NEXT: Record<string, string> = { early: "late", late: "night", night: "early", day: "night" };

export default async function HandoverPage({ searchParams }: { searchParams: Promise<{ home?: string; date?: string }> }) {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) return null;
  const sp = await searchParams;
  const home = (await listVisibleHomes(user, org.id)).find((h) => h.id === sp.home);
  if (!home || !can(user.grants, "child:write", { organisationId: org.id, homeId: home.id })) return <p className="text-sm text-muted">Not available for your role.</p>;
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayLondon();
  const [board, recent] = await Promise.all([shiftBoard(user, org.id, home.id, ymd), recentHandovers(home.id, 5)]);
  const from = currentShift();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="text-sm text-muted"><Link href={`/shift?home=${home.id}&date=${ymd}`} className="hover:underline">Shift</Link> · Handover</div>
      <h1 className="text-2xl font-semibold tracking-tight">Handover — {home.name}</h1>
      <div className="card">
        <ActionForm action={saveHandover.bind(null, home.id)} submitLabel="Save handover">
          <div className="grid gap-4 sm:grid-cols-3">
            <DateInput name="handoverDate" label="Date" defaultValue={new Date(`${ymd}T00:00:00Z`)} required />
            <Select name="fromShift" label="From shift" defaultValue={from} options={SHIFTS} />
            <Select name="toShift" label="To shift" defaultValue={NEXT[from]} options={SHIFTS} />
          </div>
          <Text name="staffOnDuty" label="Staff on duty" placeholder="Names of incoming staff" />
          <fieldset className="space-y-3">
            <legend className="label">Each child — one or two lines the next shift must know</legend>
            {board?.kids.map((k) => <Text key={k.id} name={`note:${k.id}`} label={fullName(k)} />)}
          </fieldset>
          <Area name="homeNotes" label="Home — visitors, appointments, maintenance, money" rows={3} />
          <Area name="tasksCarriedForward" label="Tasks carried forward" rows={2} />
          <DraftRecovery formKey={`handover:${home.id}:${ymd}`} />
        </ActionForm>
      </div>
      {recent.length > 0 && (
        <div className="card text-sm">
          <h2 className="mb-2 text-base font-semibold">Recent handovers</h2>
          <ul className="space-y-1">{recent.map(({ h, authorName }) => <li key={h.id}>{fmtDate(h.handoverDate)} · {SHIFT_LABEL[h.fromShift]} → {SHIFT_LABEL[h.toShift]} · {authorName}{h.receivedAt ? "" : <span className="text-amber-700"> · not yet received</span>}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
