import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { listVisibleHomes, primaryOrganisation } from "@/lib/homes/queries";
import { shiftBoard, todayLondon, currentShift, logsAwaitingReview, missingLogs } from "@/lib/daily/queries";
import { receiveHandover } from "@/lib/daily/actions";
import { can } from "@/lib/rbac";
import { fullName } from "@/lib/children/queries";
import { StatusPill, fmtDate, fmtDateTime } from "@/components/record-status";
import { SHIFT_LABEL, MOOD_LABEL } from "@/components/daily-log-fields";

export const metadata = { title: "Shift" };

export default async function ShiftPage({ searchParams }: { searchParams: Promise<{ home?: string; date?: string }> }) {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) return null;
  const homesList = await listVisibleHomes(user, org.id);
  const sp = await searchParams;
  const home = homesList.find((h) => h.id === sp.home) ?? homesList[0];
  if (!home) return <p className="text-sm text-muted">No home visible to your role.</p>;
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayLondon();
  const board = await shiftBoard(user, org.id, home.id, ymd);
  if (!board) return <p className="text-sm text-muted">Your role cannot view daily records.</p>;
  const canWrite = can(user.grants, "child:write", { organisationId: org.id, homeId: home.id });
  const canReview = can(user.grants, "record:review", { organisationId: org.id, homeId: home.id });
  const [awaiting, gaps] = canReview ? await Promise.all([logsAwaitingReview(home.id), missingLogs(home.id, 7)]) : [[], []];
  const prev = new Date(`${ymd}T00:00:00Z`); prev.setUTCDate(prev.getUTCDate() - 1);
  const next = new Date(`${ymd}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const isToday = ymd === todayLondon();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shift · {home.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted">
            <Link href={`/shift?home=${home.id}&date=${prev.toISOString().slice(0, 10)}`} className="btn-ghost px-2 py-0.5">‹</Link>
            <span className="font-medium text-ink">{fmtDate(new Date(`${ymd}T00:00:00Z`))}{isToday ? " · today" : ""}</span>
            <Link href={`/shift?home=${home.id}&date=${next.toISOString().slice(0, 10)}`} className="btn-ghost px-2 py-0.5">›</Link>
            {!isToday && <Link href={`/shift?home=${home.id}`} className="underline">Today</Link>}
          </div>
        </div>
        {homesList.length > 1 && (
          <div className="flex gap-2 text-sm">{homesList.map((h) => <Link key={h.id} href={`/shift?home=${h.id}&date=${ymd}`} className={`pill ${h.id === home.id ? "border-brand text-brand" : ""}`}>{h.name}</Link>)}</div>
        )}
      </div>

      {/* Handover */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Handover</h2>
          {canWrite && <Link href={`/shift/handover?home=${home.id}&date=${ymd}`} className="btn-ghost">Write handover</Link>}
        </div>
        {board.handover ? (
          <div className="mt-3 space-y-2 text-sm">
            <div className="text-muted">{fmtDate(board.handover.handoverDate)} · {SHIFT_LABEL[board.handover.fromShift]} → {SHIFT_LABEL[board.handover.toShift]}{board.handover.staffOnDuty ? ` · On duty: ${board.handover.staffOnDuty}` : ""}</div>
            {board.handover.childNotes.map((n) => {
              const k = board.kids.find((x) => x.id === n.childId);
              return <div key={n.childId}><span className="font-medium">{k ? fullName(k) : "Child"}:</span> {n.note}</div>;
            })}
            {board.handover.homeNotes && <div><span className="font-medium">Home:</span> {board.handover.homeNotes}</div>}
            {board.handover.tasksCarriedForward && <div><span className="font-medium">Carry forward:</span> {board.handover.tasksCarriedForward}</div>}
            {board.handover.receivedAt ? (
              <div className="text-xs text-muted">Received {fmtDateTime(board.handover.receivedAt)}</div>
            ) : canWrite ? (
              <form action={receiveHandover.bind(null, board.handover.id)}><button className="btn" type="submit">I have read and received this handover</button></form>
            ) : null}
          </div>
        ) : <p className="mt-2 text-sm text-muted">No handover written for this date yet.</p>}
      </section>

      {/* Children */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Children · {board.kids.length}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {board.kids.map((k) => {
            const mine = board.logs.filter((l) => l.childId === k.id);
            return (
              <div key={k.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/children/${k.id}/daily`} className="font-medium text-brand hover:underline">{fullName(k)}</Link>
                  {canWrite && <Link href={`/children/${k.id}/log/new?date=${ymd}&shift=${currentShift()}`} className="btn">Log shift</Link>}
                </div>
                {mine.length === 0 ? <p className="mt-2 text-sm text-muted">No log for this date.</p> : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {mine.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center gap-2">
                        <Link href={`/shift/log/${l.id}`} className="hover:underline">{SHIFT_LABEL[l.shift]}</Link>
                        <StatusPill status={l.status} /><span className="pill">{MOOD_LABEL[l.mood]}</span>
                        {l.concerns && <span className="text-xs text-danger">concern noted</span>}
                        <span className="text-xs text-muted">{l.authorName}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {canReview && (awaiting.length > 0 || gaps.length > 0) && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <h2 className="mb-2 text-base font-semibold">Awaiting review · {awaiting.length}</h2>
            {awaiting.length === 0 ? <p className="text-sm text-muted">Nothing waiting.</p> : (
              <ul className="space-y-1 text-sm">{awaiting.map((a) => <li key={a.id}><Link href={`/shift/log/${a.id}`} className="text-brand hover:underline">{a.childFirst} {a.childLast}</Link> · {fmtDate(a.logDate)} {SHIFT_LABEL[a.shift]} · {a.authorName}</li>)}</ul>
            )}
          </div>
          <div className="card">
            <h2 className="mb-2 text-base font-semibold">Missing logs, last 7 days · {gaps.length}</h2>
            {gaps.length === 0 ? <p className="text-sm text-ok">Every child has a log for every day.</p> : (
              <ul className="max-h-48 space-y-1 overflow-auto text-sm">{gaps.map((g) => <li key={g.childId + g.date}><Link href={`/shift?home=${home.id}&date=${g.date}`} className="hover:underline">{fmtDate(new Date(`${g.date}T00:00:00Z`))}</Link> · {g.name}</li>)}</ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
