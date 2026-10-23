import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getVisibleHome } from "@/lib/homes/queries";
import { evidencePack } from "@/lib/inspection/pack";
import { audit } from "@/lib/audit";
import { requestMeta } from "@/lib/auth/session";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { INCIDENT_TYPE_LABEL } from "@/lib/rules/incidents";
import { RATING_LABEL, QUALITY_STANDARDS } from "@/lib/rules/governance";
import { LEGAL_LABEL } from "@/components/child-form";
import { fmtDate, fmtDateTime } from "@/components/record-status";
import { nowMs } from "@/lib/time";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Evidence pack" };

export default async function EvidencePackPage({ params, searchParams }: { params: Promise<{ homeId: string }>; searchParams: Promise<{ months?: string }> }) {
  const { homeId } = await params;
  const user = await requireUser();
  const home = await getVisibleHome(user, homeId);
  if (!home) notFound();
  const scope = { organisationId: home.organisationId, homeId };
  if (!can(user.grants, "inspection:export", scope)) return <p className="text-sm text-muted">Your role cannot generate the evidence pack.</p>;
  const months = Math.min(24, Math.max(1, Number((await searchParams).months ?? 12) || 12));
  const now = new Date(nowMs());
  const from = new Date(now); from.setMonth(from.getMonth() - months);
  const pack = await evidencePack(homeId, from, now, now);
  if (!pack) notFound();
  await audit({ ...scope, actorUserId: user.id, actorRole: user.role, action: "export", entityType: "evidence_pack", entityId: homeId, diff: { after: { months } }, ...(await requestMeta()) });
  const m = pack.metrics!;
  const placed = pack.register.filter((r) => !r.p.dischargedOn);

  return (
    <div className="mx-auto max-w-5xl space-y-6 print:max-w-none">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="text-sm text-muted"><Link href={`/homes/${homeId}`} className="hover:underline">{home.name}</Link> · Evidence pack</div>
        <div className="flex items-center gap-2 text-sm"><span className="text-muted">Period:</span>{[6, 12, 24].map((n) => <Link key={n} href={`?months=${n}`} className={`pill ${months === n ? "border-brand text-brand" : ""}`}>{n} months</Link>)}<PrintButton /></div>
      </div>

      <div className="border-b border-line pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{home.name} — inspection evidence pack</h1>
        <p className="text-sm text-muted">Ofsted URN {home.ofstedUrn ?? "—"} · {[home.addressLine1, home.town, home.postcode].filter(Boolean).join(", ")} · Period {fmtDate(from)} to {fmtDate(now)} · Generated {fmtDateTime(now)} by {user.fullName} ({user.role ? ROLE_LABELS[user.role] : ""})</p>
        <p className="mt-1 text-xs text-muted">Organised by SCCIF judgement area. Every figure is drawn live from the records; this export is itself logged.</p>
      </div>

      {/* 1. Overall experiences and progress */}
      <Sect n="1" title="Overall experiences and progress of children">
        <Grid items={[
          ["Children placed", `${placed.length}${home.capacity ? ` of ${home.capacity}` : ""}`], ["Admitted in period", m.children.admitted], ["Left in period", m.children.discharged],
          ["Daily logs in period", m.recording.logsInPeriod], ["Key-work sessions", m.recording.keyworkInPeriod], ["Child's voice items without an outcome", m.recording.voiceUnanswered, m.recording.voiceUnanswered > 0],
          ["Children without a placement plan", pack.childrenNoPlan.length, pack.childrenNoPlan.length > 0], ["Medication refused / missed", m.medication.refusedOrMissed], ["Medication errors", m.medication.errors, m.medication.errors > 0],
        ]} />
        <h3 className="mt-4 text-sm font-semibold">Register of children (Schedule 4 para 1)</h3>
        <table className="table text-xs"><thead><tr><th>Name</th><th>DOB</th><th>Legal status</th><th>Placing authority</th><th>Admitted</th><th>Left</th><th>Destination</th></tr></thead><tbody>
          {pack.register.map(({ c, p }) => <tr key={p.id}><td>{c.firstName} {c.lastName}</td><td>{fmtDate(c.dateOfBirth)}</td><td>{LEGAL_LABEL[c.legalStatus]}</td><td>{c.placingAuthority ?? "—"}</td><td>{fmtDate(p.admittedOn)}</td><td>{fmtDate(p.dischargedOn)}</td><td>{p.dischargeDestination ?? ""}</td></tr>)}
        </tbody></table>
        <h3 className="mt-4 text-sm font-semibold">Placement plans (Reg 17)</h3>
        <table className="table text-xs"><thead><tr><th>Child</th><th>Status</th><th>Version</th><th>Review due</th></tr></thead><tbody>
          {pack.plans.map(({ p, childFirst, childLast }) => <tr key={p.id}><td>{childFirst} {childLast}</td><td>{p.status}</td><td>{p.version}</td><td>{fmtDate(p.reviewDueOn)}</td></tr>)}
          {pack.childrenNoPlan.map(({ c }) => <tr key={c.id} className="text-danger"><td>{c.firstName} {c.lastName}</td><td colSpan={3}>No placement plan on record</td></tr>)}
        </tbody></table>
        <h3 className="mt-4 text-sm font-semibold">Children&apos;s voice — what they said and what happened (Reg 7)</h3>
        <ul className="list-disc space-y-1 pl-5 text-xs">{pack.voice.slice(0, 20).map(({ v, childFirst }) => <li key={v.id}><span className="text-muted">{fmtDate(v.recordedOn)} · {childFirst}:</span> “{v.whatTheChildSaid}” {v.outcome ? <span className="text-ok">→ {v.outcome}</span> : <span className="text-amber-700">→ no outcome recorded</span>}</li>)}</ul>
      </Sect>

      {/* 2. How well children are helped and protected */}
      <Sect n="2" title="How well children are helped and protected">
        <Grid items={[
          ["Incidents in period", m.incidents.total], ["High / critical", m.incidents.highOrCritical, m.incidents.highOrCritical > 0], ["Physical interventions", m.incidents.restraint], ["Missing episodes", m.incidents.missing],
          ["Safeguarding concerns", m.incidents.safeguarding], ["Allegations against staff", m.incidents.allegations, m.incidents.allegations > 0], ["Risk assessments overdue review", m.risk.overdueReview, m.risk.overdueReview > 0], ["Follow-ups overdue now", m.followUps.overdue, m.followUps.overdue > 0],
        ]} />
        <h3 className="mt-4 text-sm font-semibold">Current risk assessments (Reg 12)</h3>
        <table className="table text-xs"><thead><tr><th>Child</th><th>Assessment</th><th>Level</th><th>Status</th><th>Review due</th></tr></thead><tbody>
          {pack.risks.map(({ r, childFirst, childLast, overdue }) => <tr key={r.id} className={overdue ? "text-danger" : ""}><td>{childFirst} {childLast}</td><td>{r.title}</td><td>{r.level}</td><td>{r.status}</td><td>{fmtDate(r.reviewDueOn)}{overdue ? " overdue" : ""}</td></tr>)}
        </tbody></table>
        <h3 className="mt-4 text-sm font-semibold">Measures of control and restraint register (Reg 35)</h3>
        <table className="table text-xs"><thead><tr><th>Date</th><th>Child</th><th>Measure</th><th>Duration</th><th>Child&apos;s view</th><th>Debrief</th><th>Manager signed</th></tr></thead><tbody>
          {pack.restraints.map(({ pi, childFirst, childLast }) => <tr key={pi.id}><td>{fmtDateTime(pi.startedAt)}</td><td>{childFirst} {childLast}</td><td>{pi.holdType}</td><td>{pi.durationMinutes} min</td><td className={pi.childsViewRecordedAt ? "" : "text-danger"}>{pi.childsViewRecordedAt ? fmtDate(pi.childsViewRecordedAt) : "Not recorded"}</td><td className={pi.staffDebriefAt ? "" : "text-danger"}>{pi.staffDebriefAt ? fmtDate(pi.staffDebriefAt) : "Not done"}</td><td className={pi.managerSignedAt ? "" : "text-danger"}>{pi.managerSignedAt ? fmtDate(pi.managerSignedAt) : "Unsigned"}</td></tr>)}
          {pack.restraints.length === 0 && <tr><td colSpan={7} className="text-muted">No physical interventions in the period.</td></tr>}
        </tbody></table>
        <h3 className="mt-4 text-sm font-semibold">Missing episodes (Reg 34(4))</h3>
        <table className="table text-xs"><thead><tr><th>Left</th><th>Child</th><th>Police informed</th><th>Returned</th><th>Welcome-back conversation</th><th>Independent interview</th></tr></thead><tbody>
          {pack.missing.map(({ me, childFirst, childLast }) => <tr key={me.id}><td>{fmtDateTime(me.leftAt)}</td><td>{childFirst} {childLast}</td><td className={me.policeInformedAt ? "" : "text-danger"}>{me.policeInformedAt ? `${fmtDateTime(me.policeInformedAt)} ${me.policeReference ?? ""}` : "Not recorded"}</td><td>{fmtDateTime(me.returnedAt)}</td><td className={me.returnConversationAt ? "" : "text-danger"}>{me.returnConversationAt ? fmtDate(me.returnConversationAt) : "Not recorded"}</td><td className={me.independentInterviewAt || me.independentInterviewOfferedAt ? "" : "text-danger"}>{me.independentInterviewAt ? `Held ${fmtDate(me.independentInterviewAt)}` : me.independentInterviewOfferedAt ? `Offered ${fmtDate(me.independentInterviewOfferedAt)}` : "Not offered"}</td></tr>)}
          {pack.missing.length === 0 && <tr><td colSpan={6} className="text-muted">No missing episodes in the period.</td></tr>}
        </tbody></table>
        <h3 className="mt-4 text-sm font-semibold">All incidents</h3>
        <table className="table text-xs"><thead><tr><th>Date</th><th>Type</th><th>Child</th><th>Severity</th><th>Record</th></tr></thead><tbody>
          {pack.incidents.map(({ i, childFirst, childLast }) => <tr key={i.id}><td>{fmtDateTime(i.occurredAt)}</td><td>{INCIDENT_TYPE_LABEL[i.type]}</td><td>{childFirst ? `${childFirst} ${childLast}` : "Home"}</td><td>{i.severity}</td><td>{i.status}</td></tr>)}
        </tbody></table>
        <h3 className="mt-4 text-sm font-semibold">Notifications sent (Reg 40)</h3>
        <table className="table text-xs"><thead><tr><th>Sent</th><th>To</th><th>Method</th><th>Reference</th></tr></thead><tbody>
          {pack.notifications.map((n) => <tr key={n.id}><td>{fmtDateTime(n.sentAt)}</td><td>{n.recipient.replace("_", " ")}</td><td>{n.method ?? ""}</td><td>{n.reference ?? ""}</td></tr>)}
          {pack.notifications.length === 0 && <tr><td colSpan={4} className="text-muted">None in the period.</td></tr>}
        </tbody></table>
      </Sect>

      {/* 3. Effectiveness of leaders and managers */}
      <Sect n="3" title="The effectiveness of leaders and managers">
        <Grid items={[
          ["Care staff", m.staff.careStaff], ["Supervision overdue", m.staff.supervisionOverdue, m.staff.supervisionOverdue > 0], ["Schedule 2 files incomplete", m.staff.schedule2Incomplete, m.staff.schedule2Incomplete > 0], ["Training expired", m.staff.trainingExpired, m.staff.trainingExpired > 0],
          ["Level 3 overdue (Reg 32)", m.staff.level3Overdue, m.staff.level3Overdue > 0], ["Safety checks overdue", m.checks.overdue, m.checks.overdue > 0], ["Reg 44 visits in period", m.governance.reg44InPeriod], ["Reg 44 status", m.governance.reg44Status === "overdue" ? "Overdue" : "In date", m.governance.reg44Status === "overdue"],
          ["Reg 45 status", m.governance.reg45Status === "overdue" ? "Overdue" : "In date", m.governance.reg45Status === "overdue"], ["Statement of Purpose", m.governance.sopOnFile ? (m.governance.sopNotified ? "On file, Ofsted notified" : "On file, not notified") : "Missing", !m.governance.sopOnFile || !m.governance.sopNotified], ["Policies overdue review", m.governance.policiesOverdue, m.governance.policiesOverdue > 0], ["Follow-ups completed in period", m.followUps.completedInPeriod],
        ]} />
        <h3 className="mt-4 text-sm font-semibold">Staff register (Schedule 4 para 2) and fitness (Reg 32, Schedule 2)</h3>
        <table className="table text-xs"><thead><tr><th>Name</th><th>Role</th><th>Started</th><th>Schedule 2</th><th>DBS</th><th>Level 3</th><th>Last supervision</th><th>Appraisal</th><th>Training expired</th></tr></thead><tbody>
          {pack.staff.map((s) => <tr key={s.m.id}><td>{s.u.fullName}</td><td>{ROLE_LABELS[s.m.role]}</td><td>{fmtDate(s.r?.startDate)}</td><td className={s.schedule2Missing.length ? "text-danger" : "text-ok"}>{s.schedule2Missing.length ? `${s.schedule2Missing.length} missing` : "Complete"}</td><td>{s.r?.dbsIssuedOn ? fmtDate(s.r.dbsIssuedOn) : <span className="text-danger">None</span>}</td><td>{s.r?.level3AchievedOn ? fmtDate(s.r.level3AchievedOn) : "—"}</td><td>{fmtDate(s.lastSupervision)}</td><td>{fmtDate(s.lastAppraisal)}</td><td className={s.trainingExpired ? "text-danger" : ""}>{s.trainingExpired}</td></tr>)}
        </tbody></table>
        <h3 className="mt-4 text-sm font-semibold">Regulation 44 visits</h3>
        <table className="table text-xs"><thead><tr><th>Date</th><th>Visitor</th><th>Safeguarded</th><th>Wellbeing</th><th>Report</th><th>Ofsted copy</th><th>Manager response</th></tr></thead><tbody>
          {pack.reg44.map(({ v, visitor }) => <tr key={v.id}><td>{fmtDate(v.visitedOn)}</td><td>{visitor}</td><td className={v.safeguardingEffective === false ? "text-danger" : ""}>{v.safeguardingEffective === true ? "Yes" : v.safeguardingEffective === false ? "No" : "—"}</td><td className={v.conductPromotesWellbeing === false ? "text-danger" : ""}>{v.conductPromotesWellbeing === true ? "Yes" : v.conductPromotesWellbeing === false ? "No" : "—"}</td><td>{v.status}</td><td className={v.ofstedCopyOn ? "" : "text-danger"}>{v.ofstedCopyOn ? fmtDate(v.ofstedCopyOn) : "Not sent"}</td><td>{v.managerRespondedAt ? fmtDate(v.managerRespondedAt) : <span className="text-amber-700">Pending</span>}</td></tr>)}
          {pack.reg44.length === 0 && <tr><td colSpan={7} className="text-danger">No Reg 44 visits recorded in the period.</td></tr>}
        </tbody></table>
        <h3 className="mt-4 text-sm font-semibold">Regulation 45 reviews</h3>
        {pack.reg45.map((r) => <div key={r.id} className="mb-2 text-xs"><div className="font-medium">{fmtDate(r.periodFrom)} – {fmtDate(r.periodTo)} · {r.status}{r.riSignedAt ? ` · RI signed ${fmtDate(r.riSignedAt)}` : ""}{r.ofstedCopyOn ? ` · Ofsted copy ${fmtDate(r.ofstedCopyOn)}` : ""}</div><div className="flex flex-wrap gap-1">{QUALITY_STANDARDS.map((q) => { const s = r.standards.find((x) => x.regulation === q.regulation); return <span key={q.regulation} className={`pill ${s?.rating === "requires_improvement" ? "text-danger" : s?.rating === "strong" ? "text-ok" : ""}`}>Reg {q.regulation}: {RATING_LABEL[s?.rating ?? "not_assessed"]}</span>; })}</div></div>)}
        {pack.reg45.length === 0 && <p className="text-xs text-danger">No Reg 45 review on record.</p>}
        <h3 className="mt-4 text-sm font-semibold">Fire drills and fire checks (Reg 25, Schedule 4 para 6)</h3>
        <table className="table text-xs"><thead><tr><th>Date</th><th>Check</th><th>Result</th><th>Findings</th></tr></thead><tbody>
          {pack.fireDrills.slice(0, 30).map(({ r, name }) => <tr key={r.id}><td>{fmtDate(r.checkedOn)}</td><td>{name}</td><td className={r.passed ? "text-ok" : "text-danger"}>{r.passed ? "Pass" : "Fail"}</td><td>{r.findings ?? ""}</td></tr>)}
        </tbody></table>
        <h3 className="mt-4 text-sm font-semibold">Visitors (Schedule 4 para 5)</h3>
        <p className="text-xs text-muted">{pack.visitors.length} visitors recorded in the period. Full book at the visitors page.</p>
      </Sect>

      <footer className="border-t border-line pt-3 text-xs text-muted">Kaizen · generated {fmtDateTime(now)} · figures reflect the records at the moment of generation.</footer>
    </div>
  );
}

function Sect({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return <section className="card print:border-0 print:p-0 print:shadow-none break-inside-avoid"><h2 className="mb-3 text-lg font-semibold">{n}. {title}</h2>{children}</section>;
}
function Grid({ items }: { items: Array<[string, string | number, boolean?]> }) {
  return <div className="grid gap-2 sm:grid-cols-4 text-sm">{items.map(([k, v, bad]) => <div key={k} className={`rounded-md border p-2 ${bad ? "border-red-200 bg-red-50" : "border-line"}`}><div className="text-xs uppercase tracking-wide text-muted">{k}</div><div className={`text-lg font-semibold ${bad ? "text-danger" : ""}`}>{v}</div></div>)}</div>;
}
