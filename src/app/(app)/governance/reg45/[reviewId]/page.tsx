import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { followUpTasks, homes, reg45Reviews, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { updateReg45, submitReg45, refreshReg45Snapshot, riSignReg45 } from "@/lib/governance/actions";
import type { HomeMetrics } from "@/lib/governance/metrics";
import { can } from "@/lib/rbac";
import { QUALITY_STANDARDS, RATING_LABEL } from "@/lib/rules/governance";
import { ActionForm, Area, DateInput } from "@/components/form";
import { StatusPill, fmtDate, fmtDateTime } from "@/components/record-status";
import { TaskList } from "@/components/task-list";
import { nowMs } from "@/lib/time";

const RATING_TONE: Record<string, string> = { strong: "text-ok", adequate: "", requires_improvement: "text-danger", not_assessed: "text-muted" };

export default async function Reg45Page({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  const user = await requireUser();
  const [r] = await db.select().from(reg45Reviews).where(eq(reg45Reviews.id, reviewId)).limit(1);
  if (!r) notFound();
  const scope = { organisationId: r.organisationId, homeId: r.homeId };
  if (!can(user.grants, "home:read", scope)) notFound();
  const [home] = await db.select().from(homes).where(eq(homes.id, r.homeId)).limit(1);
  const [tasks, names] = await Promise.all([
    db.select({ t: followUpTasks, ownerName: users.fullName }).from(followUpTasks).leftJoin(users, eq(users.id, followUpTasks.ownerUserId)).where(eq(followUpTasks.sourceId, r.id)).orderBy(followUpTasks.dueAt),
    db.select({ id: users.id, n: users.fullName }).from(users).then((x) => Object.fromEntries(x.map((u) => [u.id, u.n]))),
  ]);
  const canManage = can(user.grants, "home:manage", scope);
  const editable = r.status === "draft" && canManage;
  const isRi = ["responsible_individual", "director"].includes(user.role ?? "") && can(user.grants, "record:lock", scope);
  const m = r.dataSnapshot as unknown as HomeMetrics;
  const now = nowMs();
  const byReg = Object.fromEntries(r.standards.map((s) => [s.regulation, s]));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="text-sm text-muted"><Link href={`/governance?home=${r.homeId}`} className="hover:underline">Governance · {home?.name}</Link> · Reg 45 review</div>
      <div><h1 className="text-2xl font-semibold tracking-tight">Quality of care review — {fmtDate(r.periodFrom)} to {fmtDate(r.periodTo)}</h1><div className="mt-1 flex flex-wrap items-center gap-2 text-sm"><StatusPill status={r.status} version={r.version} />{r.riSignedAt && <span className="pill text-ok">RI signed {fmtDate(r.riSignedAt)}</span>}{r.ofstedCopyOn ? <span className="pill text-ok">Ofsted copy {fmtDate(r.ofstedCopyOn)}</span> : r.status === "locked" ? <span className="pill text-amber-700">Ofsted copy pending</span> : null}</div></div>

      {/* Data snapshot */}
      {m?.incidents && (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">The numbers for this period <span className="font-normal text-muted">(from the system)</span></h2>{editable && <form action={refreshReg45Snapshot.bind(null, r.id)}><button className="btn-ghost text-xs" type="submit">Refresh snapshot</button></form>}</div>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <N k="Children placed" v={m.children.placed} s={`${m.children.admitted} admitted · ${m.children.discharged} left`} />
            <N k="Incidents" v={m.incidents.total} s={`${m.incidents.highOrCritical} high/critical`} bad={m.incidents.highOrCritical > 0} />
            <N k="Physical interventions" v={m.incidents.restraint} />
            <N k="Missing episodes" v={m.incidents.missing} />
            <N k="Safeguarding / allegations" v={m.incidents.safeguarding + m.incidents.allegations} bad={m.incidents.allegations > 0} />
            <N k="Complaints" v={m.incidents.complaints} />
            <N k="Follow-ups" v={m.followUps.open} s={`open · ${m.followUps.overdue} overdue · ${m.followUps.completedInPeriod} completed`} bad={m.followUps.overdue > 0} />
            <N k="Risk reviews overdue" v={m.risk.overdueReview} s={`of ${m.risk.current}`} bad={m.risk.overdueReview > 0} />
            <N k="Daily logs" v={m.recording.logsInPeriod} s={`${m.recording.missingLogDays7} missing days (last 7) · ${m.recording.awaitingReview} awaiting review`} bad={m.recording.missingLogDays7 > 0} />
            <N k="Key-work sessions" v={m.recording.keyworkInPeriod} />
            <N k="Child's voice without outcome" v={m.recording.voiceUnanswered} bad={m.recording.voiceUnanswered > 0} />
            <N k="Medication refused / missed" v={m.medication.refusedOrMissed} s={`${m.medication.errors} errors`} bad={m.medication.errors > 0} />
            <N k="Supervision overdue" v={m.staff.supervisionOverdue} s={`of ${m.staff.careStaff} staff`} bad={m.staff.supervisionOverdue > 0} />
            <N k="Sch 2 files incomplete" v={m.staff.schedule2Incomplete} bad={m.staff.schedule2Incomplete > 0} />
            <N k="Training expired" v={m.staff.trainingExpired} s={`${m.staff.level3Overdue} Level 3 overdue`} bad={m.staff.trainingExpired > 0} />
            <N k="Safety checks overdue" v={m.checks.overdue} s={`${m.checks.failedLast} failed last time`} bad={m.checks.overdue > 0 || m.checks.failedLast > 0} />
            <N k="Reg 44 visits in period" v={m.governance.reg44InPeriod} s={`last ${fmtDate(m.governance.lastReg44 ? new Date(m.governance.lastReg44) : null)}`} />
            <N k="Statement of Purpose" v={m.governance.sopOnFile ? "On file" : "Missing"} s={m.governance.sopNotified ? "Ofsted notified" : "not notified"} bad={!m.governance.sopOnFile || !m.governance.sopNotified} />
          </div>
        </section>
      )}

      {editable ? (
        <div className="card">
          <ActionForm action={updateReg45.bind(null, r.id)} submitLabel="Save review" successMessage="Saved." className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-base font-semibold">Quality standards <span className="font-normal text-muted">(Regs 6–14)</span></h2>
              {QUALITY_STANDARDS.map((q) => { const s = byReg[q.regulation]; return (
                <fieldset key={q.regulation} className="rounded-md border border-line p-3 space-y-2">
                  <legend className="px-1 font-medium">Reg {q.regulation} — {q.name}</legend>
                  <p className="text-xs text-muted">{q.prompts}</p>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div><label className="label" htmlFor={`qs${q.regulation}.rating`}>Rating</label><select id={`qs${q.regulation}.rating`} name={`qs${q.regulation}.rating`} className="input" defaultValue={s?.rating ?? "not_assessed"}>{Object.entries(RATING_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                    <div className="sm:col-span-3"><Area name={`qs${q.regulation}.evidence`} label="Evidence and evaluation" defaultValue={s?.evidence} rows={3} /></div>
                  </div>
                  <Area name={`qs${q.regulation}.actions`} label="Actions — one per line; each becomes a tracked action on submit" defaultValue={s?.actions} rows={2} />
                </fieldset>); })}
            </div>
            <Area name="feedbackFromChildren" label="Feedback from children" defaultValue={r.feedbackFromChildren} rows={3} /><Area name="feedbackFromOthers" label="Feedback from parents, social workers, IROs, school" defaultValue={r.feedbackFromOthers} rows={3} />
            <Area name="progressOnPreviousActions" label="Progress on actions from the last review" defaultValue={r.progressOnPreviousActions} rows={3} />
            <Area name="strengths" label="Strengths" defaultValue={r.strengths} rows={3} /><Area name="areasForImprovement" label="Areas for improvement" defaultValue={r.areasForImprovement} rows={3} /><Area name="summary" label="Overall summary" defaultValue={r.summary} rows={4} />
            <DateInput name="ofstedCopyOn" label="Copy sent to Ofsted and placing authorities (Reg 45(4))" defaultValue={r.ofstedCopyOn} />
          </ActionForm>
          <form action={submitReg45.bind(null, r.id)} className="mt-4 border-t border-line pt-4"><button className="btn" type="submit">Submit for RI sign-off</button><p className="mt-1 text-xs text-muted">Turns every action line into a tracked action for the registered manager.</p></form>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="card space-y-3 text-sm">
            <h2 className="text-base font-semibold">Quality standards</h2>
            {QUALITY_STANDARDS.map((q) => { const s = byReg[q.regulation]; return <div key={q.regulation} className="border-t border-line pt-3 first:border-0 first:pt-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">Reg {q.regulation} — {q.name}</span><span className={`pill ${RATING_TONE[s?.rating ?? "not_assessed"]}`}>{RATING_LABEL[s?.rating ?? "not_assessed"]}</span></div><div className="mt-1 whitespace-pre-line">{s?.evidence || <span className="text-muted">No evaluation recorded.</span>}</div>{s?.actions && <div className="mt-1 text-muted"><span className="font-medium">Actions:</span> <span className="whitespace-pre-line">{s.actions}</span></div>}</div>; })}
          </section>
          <section className="card space-y-3 text-sm"><B k="Feedback from children" v={r.feedbackFromChildren} /><B k="Feedback from others" v={r.feedbackFromOthers} /><B k="Progress on previous actions" v={r.progressOnPreviousActions} /><B k="Strengths" v={r.strengths} /><B k="Areas for improvement" v={r.areasForImprovement} /><B k="Summary" v={r.summary} /></section>
          {isRi && r.status !== "locked" && (
            <section className="card"><h2 className="mb-2 text-base font-semibold">Responsible Individual sign-off</h2><form action={riSignReg45.bind(null, r.id)} className="flex flex-wrap items-end gap-3"><div><label className="label" htmlFor="ofstedCopyOn">Copy sent to Ofsted on</label><input id="ofstedCopyOn" name="ofstedCopyOn" type="date" className="input" /></div><button className="btn" type="submit">Sign and lock the review</button></form></section>
          )}
        </div>
      )}

      {tasks.length > 0 && <section className="card"><h2 className="mb-2 text-base font-semibold">Actions from this review</h2><TaskList rows={tasks} canAct={canManage} isSenior={canManage} isMine={() => canManage} now={now} /></section>}
      <div className="card text-xs text-muted"><div>Created {fmtDateTime(r.createdAt)} by {names[r.createdBy ?? ""]}</div>{r.submittedAt && <div>Submitted {fmtDateTime(r.submittedAt)}</div>}{r.lockedAt && <div>Locked {fmtDateTime(r.lockedAt)} by {names[r.lockedBy ?? ""]}</div>}</div>
    </div>
  );
}
function N({ k, v, s, bad }: { k: string; v: number | string; s?: string; bad?: boolean }) { return <div className={`rounded-md border p-2 ${bad ? "border-red-200 bg-red-50" : "border-line"}`}><div className="text-xs uppercase tracking-wide text-muted">{k}</div><div className={`text-lg font-semibold ${bad ? "text-danger" : ""}`}>{v}</div>{s && <div className="text-xs text-muted">{s}</div>}</div>; }
function B({ k, v }: { k: string; v: string | null }) { return <div><div className="text-xs uppercase tracking-wide text-muted">{k}</div><div className="whitespace-pre-line">{v || "—"}</div></div>; }
