import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getChildBundle, ageOn, fullName } from "@/lib/children/queries";
import { addChronologyEntry, uploadDocument } from "@/lib/children/actions";
import { can } from "@/lib/rbac";
import { isOverdue, daysUntil } from "@/lib/records/lifecycle";
import { ActionForm, Area, DateInput, Select, Text } from "@/components/form";
import { StatusPill, LevelPill, fmtDate, fmtDateTime } from "@/components/record-status";
import { LEGAL_LABEL } from "@/components/child-form";
import { listIncidents } from "@/lib/incidents/queries";
import { INCIDENT_TYPE_LABEL } from "@/lib/rules/incidents";

const CHRONO: Array<[string, string]> = [["other", "Other"], ["placement", "Placement"], ["education", "Education"], ["health", "Health"], ["contact", "Contact"], ["incident", "Incident"], ["missing", "Missing"], ["safeguarding", "Safeguarding"], ["achievement", "Achievement"], ["review", "Review / meeting"]];
const DOC: Array<[string, string]> = [["care_plan", "Care plan (LA)"], ["placement_plan", "Placement plan"], ["pathway_plan", "Pathway plan"], ["pep", "Personal education plan"], ["ehcp", "EHC plan"], ["health_assessment", "Health assessment"], ["school_report", "School report"], ["review_record", "Review record"], ["court_order", "Court order"], ["consent", "Consent form"], ["photo", "Photo"], ["other", "Other"]];
const DOC_LABEL = Object.fromEntries(DOC);

export default async function ChildPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const user = await requireUser();
  const b = await getChildBundle(user, childId);
  if (!b) notFound();
  const { child } = b;
  const scope = { organisationId: child.organisationId, homeId: child.homeId };
  const canWrite = can(user.grants, "child:write", scope) && !child.archivedAt;
  const canDischarge = can(user.grants, "record:review", scope) && !child.archivedAt && !!b.currentPlacement;
  const currentRisks = b.risks.filter(({ r }) => !b.risks.some((o) => o.r.supersedesId === r.id));
  const currentPlan = b.plans.find((p) => !b.plans.some((o) => o.supersedesId === p.id)) ?? null;
  const overdue = currentRisks.filter(({ r }) => isOverdue(r.reviewDueOn));
  const recentIncidents = await listIncidents(user, child.organisationId, { childId: child.id, limit: 8 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted"><Link href="/children" className="hover:underline">Children</Link> · {b.currentPlacement ? "Placed" : "Not currently placed"}</div>
          <h1 className="text-2xl font-semibold tracking-tight">{fullName(child)}</h1>
          <p className="text-sm text-muted">
            Age {ageOn(child.dateOfBirth)} · DOB {fmtDate(child.dateOfBirth)} · {LEGAL_LABEL[child.legalStatus]}
            {child.placingAuthority ? ` · ${child.placingAuthority}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/children/${child.id}/daily`} className="btn">Daily records</Link>
          <Link href={`/children/${child.id}/medication`} className="btn-ghost">Medication</Link>
          <Link href={`/children/${child.id}/money`} className="btn-ghost">Money</Link>
          {canWrite && <Link href={`/incidents/new?child=${child.id}`} className="btn-ghost">Record incident</Link>}
          {canWrite && <Link href={`/children/${child.id}/edit`} className="btn-ghost">Edit record</Link>}
          {canDischarge && <Link href={`/children/${child.id}/discharge`} className="btn-ghost">End placement</Link>}
        </div>
      </div>

      {child.archivedAt && <p className="rounded-md bg-bg px-3 py-2 text-sm text-muted">Placement ended {fmtDate(b.placements[0]?.dischargedOn)} — record retained and read-only.</p>}

      {overdue.length > 0 && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
          {overdue.length} risk assessment{overdue.length > 1 ? "s are" : " is"} overdue for review.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: core record */}
        <div className="space-y-4 lg:col-span-2">
          <section className="card">
            <h2 className="mb-3 text-base font-semibold">Placement</h2>
            {b.currentPlacement ? (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <Row k="Admitted" v={fmtDate(b.currentPlacement.admittedOn)} />
                <Row k="Planned end" v={fmtDate(b.currentPlacement.plannedEndOn)} />
                <Row k="Emergency placement" v={b.currentPlacement.emergency ? "Yes" : "No"} />
                <Row k="Key worker" v={b.keyWorkerName ?? "Not assigned"} />
                <div className="sm:col-span-2"><Row k="Reason" v={b.currentPlacement.reasonForPlacement ?? "—"} /></div>
              </dl>
            ) : <p className="text-sm text-muted">No open placement.</p>}
            {b.placements.length > 1 && (
              <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted">Placement history ({b.placements.length})</summary>
                <ul className="mt-2 space-y-1">{b.placements.map((p) => <li key={p.id}>{fmtDate(p.admittedOn)} – {p.dischargedOn ? `${fmtDate(p.dischargedOn)} → ${p.dischargeDestination}` : "present"}</li>)}</ul>
              </details>
            )}
          </section>

          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Placement plan <span className="font-normal text-muted">(Reg 17)</span></h2>
              {canWrite && !currentPlan && <Link href={`/children/${child.id}/plan/new`} className="btn-ghost">Create plan</Link>}
            </div>
            {currentPlan ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div><StatusPill status={currentPlan.status} version={currentPlan.version} /> <span className="ml-2 text-muted">Review due {fmtDate(currentPlan.reviewDueOn)}</span></div>
                <Link href={`/children/${child.id}/plan/${currentPlan.id}`} className="text-brand hover:underline">Open plan</Link>
              </div>
            ) : <p className="text-sm text-danger">No placement plan. Regulation 17 requires one at or before admission.</p>}
          </section>

          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Risk assessments <span className="font-normal text-muted">(Reg 12)</span></h2>
              {canWrite && <Link href={`/children/${child.id}/risk/new`} className="btn-ghost">New assessment</Link>}
            </div>
            {currentRisks.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
              <table className="table">
                <thead><tr><th>Title</th><th>Level</th><th>Status</th><th>Review due</th></tr></thead>
                <tbody>
                  {currentRisks.map(({ r }) => {
                    const od = isOverdue(r.reviewDueOn);
                    const soon = !od && daysUntil(r.reviewDueOn) <= 14;
                    return (
                      <tr key={r.id}>
                        <td><Link href={`/children/${child.id}/risk/${r.id}`} className="font-medium text-brand hover:underline">{r.title}</Link></td>
                        <td><LevelPill level={r.level} /></td>
                        <td><StatusPill status={r.status} version={r.version} /></td>
                        <td className={od ? "font-medium text-danger" : soon ? "text-amber-700" : ""}>{fmtDate(r.reviewDueOn)}{od ? " · overdue" : soon ? " · due soon" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 text-base font-semibold">Incidents</h2>
            {recentIncidents.length === 0 ? <p className="text-sm text-muted">None recorded.</p> : (
              <ul className="space-y-1 text-sm">
                {recentIncidents.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2">
                    <Link href={`/incidents/${i.id}`} className="font-medium text-brand hover:underline">{fmtDateTime(i.occurredAt)}</Link>
                    <span>{INCIDENT_TYPE_LABEL[i.type]}</span><span className="pill">{i.severity}</span>
                    {i.openTasks > 0 && <span className={`text-xs ${i.overdueTasks ? "text-danger" : "text-muted"}`}>{i.overdueTasks ? `${i.overdueTasks} overdue` : `${i.openTasks} open`}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 text-base font-semibold">Chronology</h2>
            {b.chronology.length === 0 ? <p className="text-sm text-muted">Nothing recorded yet.</p> : (
              <ol className="space-y-3 border-l border-line pl-4 text-sm">
                {b.chronology.map(({ e, authorName }) => (
                  <li key={e.id} className="relative">
                    <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${e.significant ? "bg-brand" : "bg-line"}`} />
                    <div className="flex flex-wrap items-baseline gap-2"><span className="font-medium">{fmtDate(e.occurredOn)}</span><span className="pill">{e.category}</span><span className="text-xs text-muted">{authorName ?? "System"}</span></div>
                    <div>{e.summary}</div>
                    {e.detail && <div className="text-muted">{e.detail}</div>}
                  </li>
                ))}
              </ol>
            )}
            {canWrite && (
              <details className="mt-4"><summary className="cursor-pointer text-sm text-brand">Add an entry</summary>
                <div className="mt-3">
                  <ActionForm action={addChronologyEntry.bind(null, child.id)} submitLabel="Add to chronology" successMessage="Added.">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <DateInput name="occurredOn" label="Date" defaultValue={new Date()} required />
                      <Select name="category" label="Category" options={CHRONO} />
                    </div>
                    <Text name="summary" label="Summary" required />
                    <Area name="detail" label="Detail" rows={2} />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="significant" />Significant event</label>
                  </ActionForm>
                </div>
              </details>
            )}
          </section>
        </div>

        {/* Right: details and documents */}
        <div className="space-y-4">
          <section className="card text-sm">
            <h2 className="mb-3 text-base font-semibold">People involved</h2>
            {child.contacts.length === 0 ? <p className="text-muted">None recorded.</p> : (
              <ul className="space-y-2">
                {child.contacts.map((p, i) => (
                  <li key={i}>
                    <div className="font-medium">{p.name} <span className="font-normal text-muted">· {p.role}{p.parentalResponsibility ? " · PR" : ""}</span></div>
                    <div className="text-muted">{[p.organisation, p.phone, p.email].filter(Boolean).join(" · ")}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card text-sm">
            <h2 className="mb-3 text-base font-semibold">Health</h2>
            <dl className="space-y-1">
              <Row k="GP" v={child.gpDetails ?? "—"} />
              <Row k="Allergies" v={child.allergies ?? "None recorded"} />
              <Row k="Dietary needs" v={child.dietaryNeeds ?? "—"} />
              <Row k="Conditions" v={child.healthConditions ?? "—"} />
            </dl>
          </section>

          <section className="card text-sm">
            <h2 className="mb-3 text-base font-semibold">Education</h2>
            <dl className="space-y-1">
              <Row k="Provider" v={child.educationProvider ?? "—"} />
              <Row k="Year" v={child.yearGroup ?? "—"} />
            </dl>
          </section>

          <section className="card text-sm">
            <h2 className="mb-3 text-base font-semibold">Documents <span className="font-normal text-muted">(Sch 3 paras 17–20)</span></h2>
            {b.documents.length === 0 ? <p className="text-muted">None uploaded.</p> : (
              <ul className="space-y-2">
                {b.documents.map((d) => (
                  <li key={d.id}>
                    <a href={`/documents/${d.id}`} className="font-medium text-brand hover:underline">{d.title}</a>
                    <div className="text-xs text-muted">{DOC_LABEL[d.type]} · {d.documentDate ? fmtDate(d.documentDate) : fmtDateTime(d.createdAt)} · {Math.round(d.sizeBytes / 1024)} KB</div>
                  </li>
                ))}
              </ul>
            )}
            {canWrite && (
              <details className="mt-3"><summary className="cursor-pointer text-brand">Upload a document</summary>
                <div className="mt-3">
                  <ActionForm action={uploadDocument.bind(null, child.id)} submitLabel="Upload" successMessage="Uploaded.">
                    <Text name="title" label="Title" required />
                    <Select name="type" label="Type" options={DOC} />
                    <DateInput name="documentDate" label="Document date" />
                    <div><label htmlFor="file" className="label">File (PDF, Word, image — up to 10 MB)</label><input id="file" name="file" type="file" required className="input" /></div>
                    <Text name="notes" label="Notes" />
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

function Row({ k, v }: { k: string; v: string }) {
  return (<div><dt className="text-xs uppercase tracking-wide text-muted">{k}</dt><dd className="whitespace-pre-line">{v}</dd></div>);
}
