import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getChildForUser, fullName } from "@/lib/children/queries";
import { childDailyRecords, todayLondon, currentShift } from "@/lib/daily/queries";
import { addChildVoice, respondToVoice } from "@/lib/daily/actions";
import { can } from "@/lib/rbac";
import { ActionForm, Area, DateInput, Select } from "@/components/form";
import { StatusPill, fmtDate, fmtDateTime } from "@/components/record-status";
import { SHIFT_LABEL, MOOD_LABEL } from "@/components/daily-log-fields";

const METHODS: Array<[string, string]> = [["conversation", "Conversation"], ["keywork", "Key-work session"], ["house_meeting", "House meeting"], ["written", "Written / drawn"], ["advocate", "Via advocate"], ["complaint", "Complaint"], ["survey", "Survey / questionnaire"], ["other", "Other"]];
const METHOD_LABEL = Object.fromEntries(METHODS);

export default async function ChildDailyPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const user = await requireUser();
  const child = await getChildForUser(user, childId);
  if (!child) notFound();
  const data = await childDailyRecords(user, child);
  if (!data) notFound();
  const canWrite = can(user.grants, "child:write", { organisationId: child.organisationId, homeId: child.homeId }) && !child.archivedAt;
  const unanswered = data.voice.filter(({ v }) => !v.outcome);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted"><Link href={`/children/${child.id}`} className="hover:underline">{fullName(child)}</Link> · Daily records</div>
          <h1 className="text-2xl font-semibold tracking-tight">{fullName(child)} — day to day</h1>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/children/${child.id}/log/new?date=${todayLondon()}&shift=${currentShift()}`} className="btn">Log shift</Link>
            <Link href={`/children/${child.id}/keywork/new`} className="btn-ghost">Key-work session</Link>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold">Daily logs · last 14 days</h2>
          {data.logs.length === 0 ? <p className="text-sm text-muted">No logs in the last fortnight.</p> : (
            <ul className="divide-y divide-line text-sm">
              {data.logs.map(({ l, authorName }) => (
                <li key={l.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/shift/log/${l.id}`} className="font-medium text-brand hover:underline">{fmtDate(l.logDate)} · {SHIFT_LABEL[l.shift]}</Link>
                    <StatusPill status={l.status} version={l.version} /><span className="pill">{MOOD_LABEL[l.mood]}</span><span className="text-xs text-muted">{authorName}</span>
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-line text-ink">{l.narrative}</p>
                  {l.concerns && <p className="mt-1 text-danger"><span className="font-medium">Concern:</span> {l.concerns}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <section className="card">
            <h2 className="mb-3 text-base font-semibold">Key-work</h2>
            {data.keywork.length === 0 ? <p className="text-sm text-muted">No sessions recorded.</p> : (
              <ul className="space-y-2 text-sm">
                {data.keywork.map(({ k }) => (
                  <li key={k.id}>
                    <Link href={`/children/${child.id}/keywork/${k.id}`} className="font-medium text-brand hover:underline">{fmtDate(k.sessionDate)}</Link> <StatusPill status={k.status} version={k.version} />
                    <div className="text-muted">{k.topics}</div>
                    {k.nextSessionOn && <div className="text-xs text-muted">Next: {fmtDate(k.nextSessionOn)}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="mb-1 text-base font-semibold">Child&apos;s voice <span className="font-normal text-muted">(Reg 7)</span></h2>
            <p className="mb-3 text-xs text-muted">What they said, and what happened because of it.{unanswered.length > 0 && <span className="text-amber-700"> {unanswered.length} without a recorded outcome.</span>}</p>
            {data.voice.length === 0 ? <p className="text-sm text-muted">Nothing recorded yet.</p> : (
              <ul className="space-y-3 text-sm">
                {data.voice.map(({ v, authorName }) => (
                  <li key={v.id} className="rounded-md border border-line p-2">
                    <div className="text-xs text-muted">{fmtDate(v.recordedOn)} · {METHOD_LABEL[v.method]} · {authorName}</div>
                    <blockquote className="mt-1 border-l-2 border-brand pl-2 italic">“{v.whatTheChildSaid}”</blockquote>
                    {v.response && <div className="mt-1"><span className="font-medium">Response:</span> {v.response}</div>}
                    {v.outcome ? <div className="mt-1 text-ok"><span className="font-medium">Outcome:</span> {v.outcome} <span className="text-xs text-muted">({fmtDateTime(v.respondedAt)})</span></div>
                      : canWrite ? (
                        <form action={respondToVoice.bind(null, v.id)} className="mt-2 flex gap-1">
                          <input name="outcome" placeholder="What happened as a result?" className="input py-1 text-xs" required aria-label="Outcome" />
                          <button className="btn-ghost text-xs" type="submit">Record</button>
                        </form>
                      ) : <div className="mt-1 text-xs text-amber-700">No outcome recorded yet.</div>}
                  </li>
                ))}
              </ul>
            )}
            {canWrite && (
              <details className="mt-3"><summary className="cursor-pointer text-sm text-brand">Record something the child said</summary>
                <div className="mt-3">
                  <ActionForm action={addChildVoice.bind(null, child.id)} submitLabel="Record" successMessage="Recorded.">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <DateInput name="recordedOn" label="Date" defaultValue={new Date()} required />
                      <Select name="method" label="How" options={METHODS} />
                    </div>
                    <Area name="whatTheChildSaid" label="In the child's words" rows={2} required />
                    <Area name="response" label="What we said / did straight away" rows={2} />
                  </ActionForm>
                </div>
              </details>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
