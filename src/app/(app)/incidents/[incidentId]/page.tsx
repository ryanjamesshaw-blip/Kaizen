import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getIncidentBundle, taskIsMine } from "@/lib/incidents/queries";
import { addManualTask, recordNotification, recordPiChildsView, recordPiDebrief, signPiRecord, updateIncidentNarrative, updateIncidentReview, updateMissing } from "@/lib/incidents/actions";
import { INCIDENT_TYPE_LABEL } from "@/lib/rules/incidents";
import { availableTransitions, canTransition } from "@/lib/records/lifecycle";
import { can } from "@/lib/rbac";
import { fullName } from "@/lib/children/queries";
import { ActionForm, Area, Select, Text } from "@/components/form";
import { StatusPill, fmtDateTime } from "@/components/record-status";
import { TransitionBar } from "@/components/transition-bar";
import { TaskList } from "@/components/task-list";
import { nowMs } from "@/lib/time";

const SEV: Record<string, string> = { low: "bg-bg text-muted", medium: "bg-amber-50 text-amber-800", high: "bg-orange-50 text-orange-800", critical: "bg-red-50 text-red-800" };
const RECIPIENTS: Array<[string, string]> = [["ofsted", "Ofsted"], ["placing_authority", "Placing authority / social worker"], ["police", "Police"], ["lado", "LADO"], ["iro", "IRO"], ["parents", "Parents / carers"], ["ri", "Responsible Individual"], ["other", "Other"]];
const RECIPIENT_LABEL = Object.fromEntries(RECIPIENTS);
const toLocal = (d: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default async function IncidentPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const { incidentId } = await params;
  const user = await requireUser();
  const b = await getIncidentBundle(user, incidentId);
  if (!b) notFound();
  const { inc, child, pi, missing, notes, tasks, newer, older, names } = b;
  const scope = { organisationId: inc.organisationId, homeId: inc.homeId };
  const canWrite = can(user.grants, "child:write", scope);
  const canReview = can(user.grants, "record:review", scope);
  const canLock = can(user.grants, "record:lock", scope);
  const ctx = { grants: user.grants, userId: user.id, organisationId: inc.organisationId, homeId: inc.homeId, record: { status: inc.status, createdBy: inc.createdBy } };
  const transitions = availableTransitions(ctx).filter((t) => t !== "submit");
  const editable = canTransition("edit", ctx);
  const openTasks = tasks.filter((x) => x.t.status === "open").length;
  const isSenior = canReview;
  const now = nowMs();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted"><Link href="/incidents" className="hover:underline">Incidents</Link>{child && <> · <Link href={`/children/${child.id}`} className="hover:underline">{fullName(child)}</Link></>}</div>
          <h1 className="text-2xl font-semibold tracking-tight">{INCIDENT_TYPE_LABEL[inc.type]}{child ? ` — ${fullName(child)}` : ""}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <StatusPill status={inc.status} version={inc.version} /><span className={`pill ${SEV[inc.severity]}`}>{inc.severity}</span>
            <span className="text-muted">{fmtDateTime(inc.occurredAt)}{inc.location ? ` · ${inc.location}` : ""} · recorded by {names[inc.createdBy ?? ""] ?? "—"}</span>
          </div>
        </div>
        <div className="text-right text-sm">{openTasks === 0 ? <span className="text-ok">All follow-ups complete</span> : <span>{openTasks} follow-up{openTasks > 1 ? "s" : ""} open</span>}</div>
      </div>

      {newer && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">Superseded by <Link className="underline" href={`/incidents/${newer.id}`}>version {newer.version}</Link>. Kept unchanged.</p>}
      {inc.amendmentReason && <p className="rounded-md bg-bg px-3 py-2 text-sm"><span className="font-medium">Amended from {older ? <Link className="underline" href={`/incidents/${older.id}`}>version {older.version}</Link> : "previous"}:</span> {inc.amendmentReason}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Narrative */}
          <section className="card space-y-3 text-sm">
            <h2 className="text-base font-semibold">Record</h2>
            {editable ? (
              <ActionForm action={updateIncidentNarrative.bind(null, inc.id)} submitLabel="Resubmit">
                <Area name="antecedent" label="What led up to it" defaultValue={inc.antecedent} rows={2} />
                <Area name="narrative" label="What happened" defaultValue={inc.narrative} rows={6} required />
                <div className="grid gap-4 sm:grid-cols-2"><Area name="immediateActions" label="Done straight away" defaultValue={inc.immediateActions} rows={2} /><Area name="injuries" label="Injuries" defaultValue={inc.injuries} rows={2} /></div>
                <div className="grid gap-4 sm:grid-cols-3"><Text name="location" label="Where" defaultValue={inc.location} /><Text name="staffInvolved" label="Staff involved" defaultValue={inc.staffInvolved} /><Text name="witnesses" label="Witnesses" defaultValue={inc.witnesses} /></div>
              </ActionForm>
            ) : (
              <>
                <Block k="What led up to it" v={inc.antecedent} /><Block k="What happened" v={inc.narrative} />
                <div className="grid gap-3 sm:grid-cols-2"><Block k="Done straight away" v={inc.immediateActions} /><Block k="Injuries" v={inc.injuries} /></div>
                <div className="grid gap-3 sm:grid-cols-2"><Block k="Staff involved" v={inc.staffInvolved} /><Block k="Witnesses" v={inc.witnesses} /></div>
              </>
            )}
          </section>

          {/* Reg 35 record */}
          {pi && (
            <section className="card space-y-3 text-sm">
              <h2 className="text-base font-semibold">Restraint record <span className="font-normal text-muted">(Reg 35(3))</span></h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Block k="Measure" v={pi.holdType} /><Block k="Applied by" v={pi.staffApplying} />
                <Block k="Started" v={fmtDateTime(pi.startedAt)} /><Block k="Duration" v={`${pi.durationMinutes} min`} />
              </div>
              <Block k="De-escalation tried first" v={pi.deEscalationAttempted} /><Block k="Why it was necessary" v={pi.justification} />
              <div className="grid gap-3 sm:grid-cols-3"><Block k="Injuries to child" v={pi.injuriesChild} /><Block k="Injuries to staff" v={pi.injuriesStaff} /><Block k="Medical attention" v={pi.medicalAttention} /></div>
              <Block k="Effectiveness and consequences" v={pi.effectiveness} />

              <div className="rounded-md border border-line p-3">
                <div className="font-medium">Child&apos;s view <span className="font-normal text-muted">— Reg 35(3)(h)</span></div>
                {pi.childsViewRecordedAt ? <div className="mt-1"><blockquote className="border-l-2 border-brand pl-2 italic">“{pi.childsView}”</blockquote><div className="text-xs text-muted">Recorded {fmtDateTime(pi.childsViewRecordedAt)} by {names[pi.childsViewRecordedBy ?? ""] ?? "—"}</div></div>
                  : canWrite ? <div className="mt-2"><ActionForm action={recordPiChildsView.bind(null, pi.id)} submitLabel="Record child's view"><Area name="childsView" label="In the child's words, or note that they declined" rows={2} required /></ActionForm></div>
                  : <div className="mt-1 text-amber-700">Not yet recorded.</div>}
              </div>
              <div className="rounded-md border border-line p-3">
                <div className="font-medium">Staff debrief</div>
                {pi.staffDebriefAt ? <div className="mt-1 whitespace-pre-line">{pi.staffDebriefNotes}<div className="text-xs text-muted">Debriefed {fmtDateTime(pi.staffDebriefAt)}</div></div>
                  : canReview ? <div className="mt-2"><ActionForm action={recordPiDebrief.bind(null, pi.id)} submitLabel="Record debrief"><Area name="staffDebriefNotes" label="What led to it, what was tried, what could be different" rows={3} required /></ActionForm></div>
                  : <div className="mt-1 text-amber-700">Not yet done.</div>}
              </div>
              <div className="rounded-md border border-line p-3">
                <div className="font-medium">Manager&apos;s sign-off <span className="font-normal text-muted">— Reg 35(3)(i)</span></div>
                {pi.managerSignedAt ? <div className="mt-1">{pi.managerComments && <div className="whitespace-pre-line">{pi.managerComments}</div>}<div className="text-xs text-muted">Signed {fmtDateTime(pi.managerSignedAt)} by {names[pi.managerSignedBy ?? ""] ?? "—"}</div></div>
                  : canLock ? <div className="mt-2"><ActionForm action={signPiRecord.bind(null, pi.id)} submitLabel="Sign restraint record"><Area name="managerComments" label="Comments — necessary, proportionate, in line with policy?" rows={2} />{!pi.childsViewRecordedAt && <p className="text-xs text-amber-700">The child&apos;s view must be recorded first.</p>}</ActionForm></div>
                  : <div className="mt-1 text-amber-700">Awaiting manager.</div>}
              </div>
            </section>
          )}

          {/* Missing episode */}
          {missing && (
            <section className="card space-y-3 text-sm">
              <h2 className="text-base font-semibold">Missing episode {missing.returnedAt ? <span className="pill text-ok">Returned</span> : <span className="pill text-danger">Still missing</span>}</h2>
              <div className="grid gap-3 sm:grid-cols-3"><Block k="Left / last seen" v={fmtDateTime(missing.leftAt)} /><Block k="Classification" v={missing.classification} /><Block k="Circumstances" v={missing.circumstances} /></div>
              {canWrite ? (
                <ActionForm action={updateMissing.bind(null, missing.id)} submitLabel="Save" successMessage="Saved.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Text name="policeInformedAt" label="Police informed at" type="datetime-local" defaultValue={toLocal(missing.policeInformedAt)} />
                    <Text name="policeReference" label="Police reference" defaultValue={missing.policeReference} />
                    <Text name="returnedAt" label="Returned at" type="datetime-local" defaultValue={toLocal(missing.returnedAt)} />
                    <Text name="returnedHow" label="How they returned" defaultValue={missing.returnedHow} placeholder="Came back alone / brought by police / collected by staff" />
                  </div>
                  <Area name="conditionOnReturn" label="Condition on return (physical, emotional, belongings)" defaultValue={missing.conditionOnReturn} rows={2} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Text name="returnConversationAt" label="Welcome-back conversation at" type="datetime-local" defaultValue={toLocal(missing.returnConversationAt)} />
                    <Text name="independentInterviewOfferedAt" label="Independent return interview offered at" type="datetime-local" defaultValue={toLocal(missing.independentInterviewOfferedAt)} hint="Within 72 hours of return" />
                  </div>
                  <Area name="returnConversationNotes" label="Welcome-back conversation — what they said, where they were, who with" defaultValue={missing.returnConversationNotes} rows={3} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Text name="independentInterviewAt" label="Independent interview held at" type="datetime-local" defaultValue={toLocal(missing.independentInterviewAt)} />
                    <Text name="independentInterviewBy" label="Carried out by" defaultValue={missing.independentInterviewBy} />
                  </div>
                </ActionForm>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2"><Block k="Police" v={missing.policeInformedAt ? `${fmtDateTime(missing.policeInformedAt)} · ${missing.policeReference ?? "no ref"}` : null} /><Block k="Returned" v={missing.returnedAt ? `${fmtDateTime(missing.returnedAt)} · ${missing.returnedHow ?? ""}` : null} /><Block k="Welcome-back conversation" v={missing.returnConversationNotes} /><Block k="Independent interview" v={missing.independentInterviewAt ? `${fmtDateTime(missing.independentInterviewAt)} by ${missing.independentInterviewBy ?? "—"}` : missing.independentInterviewOfferedAt ? `Offered ${fmtDateTime(missing.independentInterviewOfferedAt)}` : null} /></div>
              )}
            </section>
          )}

          {/* Manager review */}
          {(canReview || inc.managerReviewNotes || inc.lessonsLearned) && (
            <section className="card space-y-3 text-sm">
              <h2 className="text-base font-semibold">Manager review</h2>
              {canReview && inc.status !== "locked" ? (
                <ActionForm action={updateIncidentReview.bind(null, inc.id)} submitLabel="Save review" successMessage="Saved.">
                  <Area name="managerReviewNotes" label="Review — was the response right, anything missed, patterns?" defaultValue={inc.managerReviewNotes} rows={3} />
                  <Area name="lessonsLearned" label="Lessons learned / changes made" defaultValue={inc.lessonsLearned} rows={2} />
                  <fieldset><legend className="label">Notifications required</legend>
                    <div className="grid gap-1 sm:grid-cols-2"><label className="flex gap-2"><input type="checkbox" name="notifyOfsted" defaultChecked={inc.notifyOfsted} />Ofsted</label><label className="flex gap-2"><input type="checkbox" name="notifyPlacingAuthority" defaultChecked={inc.notifyPlacingAuthority} />Placing authority</label><label className="flex gap-2"><input type="checkbox" name="notifyPolice" defaultChecked={inc.notifyPolice} />Police</label><label className="flex gap-2"><input type="checkbox" name="notifyLado" defaultChecked={inc.notifyLado} />LADO</label></div>
                  </fieldset>
                </ActionForm>
              ) : (<><Block k="Review" v={inc.managerReviewNotes} /><Block k="Lessons learned" v={inc.lessonsLearned} /></>)}
            </section>
          )}

          <TransitionBar table="incident" id={inc.id} childId={child?.id ?? ""} transitions={transitions} />
        </div>

        <div className="space-y-4">
          {/* Follow-ups */}
          <section className="card">
            <h2 className="mb-2 text-base font-semibold">Follow-ups</h2>
            <TaskList rows={tasks} canAct={canWrite} isSenior={isSenior} isMine={(t) => taskIsMine(user, t)} now={now} />
            {canReview && (
              <details className="mt-3 text-sm"><summary className="cursor-pointer text-brand">Add a follow-up</summary>
                <div className="mt-2"><ActionForm action={addManualTask.bind(null, inc.id)} submitLabel="Add" successMessage="Added."><Text name="title" label="What" required /><div className="grid gap-3 sm:grid-cols-2"><Text name="dueAt" label="Due" type="datetime-local" required /><Select name="ownerRole" label="Owner" options={[["care_worker", "Care worker"], ["deputy", "Deputy"], ["registered_manager", "Registered Manager"]]} /></div></ActionForm></div>
              </details>
            )}
          </section>

          {/* Notifications */}
          <section className="card text-sm">
            <h2 className="mb-1 text-base font-semibold">Notifications <span className="font-normal text-muted">(Reg 40)</span></h2>
            <div className="mb-2 flex flex-wrap gap-1 text-xs">
              {inc.notifyOfsted && <span className={`pill ${notes.some((n) => n.recipient === "ofsted") ? "text-ok" : "text-danger"}`}>Ofsted {notes.some((n) => n.recipient === "ofsted") ? "✓" : "required"}</span>}
              {inc.notifyPlacingAuthority && <span className={`pill ${notes.some((n) => n.recipient === "placing_authority") ? "text-ok" : "text-danger"}`}>Placing authority {notes.some((n) => n.recipient === "placing_authority") ? "✓" : "required"}</span>}
              {inc.notifyPolice && <span className={`pill ${notes.some((n) => n.recipient === "police") ? "text-ok" : "text-danger"}`}>Police {notes.some((n) => n.recipient === "police") ? "✓" : "required"}</span>}
              {inc.notifyLado && <span className={`pill ${notes.some((n) => n.recipient === "lado") ? "text-ok" : "text-danger"}`}>LADO {notes.some((n) => n.recipient === "lado") ? "✓" : "required"}</span>}
            </div>
            {notes.length === 0 ? <p className="text-muted">None recorded yet.</p> : (
              <ul className="space-y-1">{notes.map((n) => <li key={n.id}><span className="font-medium">{RECIPIENT_LABEL[n.recipient]}</span> · {fmtDateTime(n.sentAt)}{n.method ? ` · ${n.method}` : ""}{n.reference ? ` · ref ${n.reference}` : ""} <span className="text-xs text-muted">by {names[n.sentBy ?? ""] ?? "—"}</span></li>)}</ul>
            )}
            {canWrite && (
              <details className="mt-3"><summary className="cursor-pointer text-brand">Record a notification sent</summary>
                <div className="mt-2"><ActionForm action={recordNotification.bind(null, inc.id)} submitLabel="Record" successMessage="Recorded.">
                  <Select name="recipient" label="Sent to" options={RECIPIENTS} />
                  <Text name="sentAt" label="Sent at" type="datetime-local" required />
                  <div className="grid gap-3 sm:grid-cols-2"><Text name="method" label="How" placeholder="Ofsted online form / email / phone" /><Text name="reference" label="Reference" /></div>
                  <Text name="notes" label="Notes" />
                </ActionForm></div>
              </details>
            )}
          </section>

          <section className="card text-xs text-muted">
            <div>Recorded {fmtDateTime(inc.createdAt)} by {names[inc.createdBy ?? ""] ?? "—"}</div>
            {inc.reviewedAt && <div>Reviewed {fmtDateTime(inc.reviewedAt)} by {names[inc.reviewedBy ?? ""] ?? "—"}</div>}
            {inc.lockedAt && <div>Locked {fmtDateTime(inc.lockedAt)} by {names[inc.lockedBy ?? ""] ?? "—"}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Block({ k, v }: { k: string; v: string | null }) {
  return <div><div className="text-xs uppercase tracking-wide text-muted">{k}</div><div className="whitespace-pre-line">{v || "—"}</div></div>;
}
