import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { listVisibleHomes, primaryOrganisation } from "@/lib/homes/queries";
import { staffDetail } from "@/lib/operations/queries";
import { addSupervision, addTraining, saveStaffRecord, signSupervision } from "@/lib/operations/actions";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { MANDATORY_COURSES, SCHEDULE_2_ITEMS, schedule2Missing, trainingStatus } from "@/lib/rules/operations";
import { ActionForm, Area, DateInput, Section, Select, Text } from "@/components/form";
import { fmtDate, fmtDateTime } from "@/components/record-status";
import { nowMs } from "@/lib/time";

export default async function StaffPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) return null;
  const d = await staffDetail(org.id, userId);
  if (!d) notFound();
  const homesList = await listVisibleHomes(user, org.id);
  const theirHomes = d.memberships.map((m) => m.homeId).filter(Boolean) as string[];
  const visible = user.id === userId || can(user.grants, "staff:read", { organisationId: org.id }) || theirHomes.some((h) => can(user.grants, "staff:read", { organisationId: org.id, homeId: h }));
  if (!visible) notFound();
  const manage = can(user.grants, "staff:manage", { organisationId: org.id }) || theirHomes.some((h) => can(user.grants, "staff:manage", { organisationId: org.id, homeId: h }));
  const now = new Date(nowMs());
  const missing = schedule2Missing(d.record);
  const r = d.record;
  const primaryHome = theirHomes[0] ?? homesList[0]?.id;
  const latest = new Map<string, (typeof d.training)[number]>();
  for (const t of d.training) { const c = latest.get(t.course); if (!c || t.completedOn > c.completedOn) latest.set(t.course, t); }
  const TS: Record<string, string> = { valid: "text-ok", expiring: "text-amber-700", expired: "text-danger", no_expiry: "text-muted" };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{d.user.fullName}</h1>
        <p className="text-sm text-muted">{d.user.email} · {d.memberships.map((m) => `${ROLE_LABELS[m.role]}${m.homeId ? ` (${homesList.find((h) => h.id === m.homeId)?.name ?? "home"})` : ""}`).join(", ")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card">
            <h2 className="mb-1 text-base font-semibold">Fitness to work <span className="font-normal text-muted">(Reg 32, Schedule 2)</span></h2>
            <p className={`mb-3 text-sm ${missing.length ? "text-danger" : "text-ok"}`}>{missing.length ? `${missing.length} item${missing.length > 1 ? "s" : ""} outstanding: ${missing.join(", ")}` : "Schedule 2 file complete."}</p>
            {manage ? (
              <ActionForm action={saveStaffRecord.bind(null, org.id, userId)} submitLabel="Save record" successMessage="Saved." className="space-y-6">
                <Section title="Employment">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Select name="homeId" label="Main home" defaultValue={r?.homeId ?? primaryHome ?? ""} options={[["", "—"], ...homesList.map((h): [string, string] => [h.id, h.name])]} />
                    <Text name="jobTitle" label="Job title" defaultValue={r?.jobTitle} />
                    <DateInput name="startDate" label="Start date" defaultValue={r?.startDate ?? null} />
                    <DateInput name="probationEndsOn" label="Probation ends" defaultValue={r?.probationEndsOn ?? null} />
                    <DateInput name="inductionCompletedOn" label="Induction completed" defaultValue={r?.inductionCompletedOn ?? null} />
                  </div>
                </Section>
                <Section title="Schedule 2 checks" description="Enter the date each was verified; leave blank if not yet done">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DateInput name="idVerifiedOn" label="Identity verified" defaultValue={r?.idVerifiedOn ?? null} />
                    <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" name="photoOnFile" defaultChecked={r?.photoOnFile} />Recent photograph on file</label>
                    <Text name="dbsNumber" label="DBS certificate number" defaultValue={r?.dbsNumber} />
                    <DateInput name="dbsIssuedOn" label="DBS issued" defaultValue={r?.dbsIssuedOn ?? null} />
                    <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="dbsUpdateService" defaultChecked={r?.dbsUpdateService} />Registered with the DBS Update Service (checked annually)</label>
                    <DateInput name="reference1ReceivedOn" label="Reference 1 received" defaultValue={r?.reference1ReceivedOn ?? null} />
                    <Text name="reference1From" label="Reference 1 from" defaultValue={r?.reference1From} />
                    <DateInput name="reference2ReceivedOn" label="Reference 2 received (most recent employer)" defaultValue={r?.reference2ReceivedOn ?? null} />
                    <Text name="reference2From" label="Reference 2 from" defaultValue={r?.reference2From} />
                    <DateInput name="previousCareEmployerVerifiedOn" label="Previous care employer — reason for leaving verified" defaultValue={r?.previousCareEmployerVerifiedOn ?? null} />
                    <DateInput name="qualificationsVerifiedOn" label="Qualifications verified" defaultValue={r?.qualificationsVerifiedOn ?? null} />
                    <DateInput name="employmentHistoryCompleteOn" label="Full employment history checked" defaultValue={r?.employmentHistoryCompleteOn ?? null} />
                    <DateInput name="rightToWorkVerifiedOn" label="Right to work verified" defaultValue={r?.rightToWorkVerifiedOn ?? null} />
                    <DateInput name="healthDeclarationOn" label="Health declaration" defaultValue={r?.healthDeclarationOn ?? null} />
                  </div>
                  <Area name="employmentGapsExplained" label="Gaps in employment and explanation" defaultValue={r?.employmentGapsExplained} rows={2} />
                </Section>
                <Section title="Qualifications" description="Reg 32(4): Level 3 Diploma within two years of starting">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Text name="level3Qualification" label="Level 3 qualification" defaultValue={r?.level3Qualification} />
                    <DateInput name="level3AchievedOn" label="Achieved on" defaultValue={r?.level3AchievedOn ?? null} />
                    <Text name="level5Qualification" label="Level 5 (managers)" defaultValue={r?.level5Qualification} />
                    <DateInput name="level5AchievedOn" label="Achieved on" defaultValue={r?.level5AchievedOn ?? null} />
                  </div>
                  <Area name="notes" label="Notes" defaultValue={r?.notes} rows={2} />
                </Section>
              </ActionForm>
            ) : (
              <ul className="grid gap-1 text-sm sm:grid-cols-2">{SCHEDULE_2_ITEMS.map((i) => { const v = r?.[i.key]; const ok = !!v; return <li key={i.key} className={ok ? "text-ok" : "text-danger"}>{ok ? "✓" : "✗"} {i.label}</li>; })}</ul>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 text-base font-semibold">Supervision and appraisal <span className="font-normal text-muted">(Reg 33)</span></h2>
            {d.supervisions.length === 0 ? <p className="text-sm text-muted">None recorded.</p> : (
              <ul className="divide-y divide-line text-sm">
                {d.supervisions.map(({ s, supervisorName }) => (
                  <li key={s.id} className="py-2">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{fmtDate(s.heldOn)}</span><span className="pill">{s.kind.replace("_", " ")}</span><span className="text-muted">with {supervisorName}</span>{s.safeguardingDiscussed && <span className="pill">safeguarding discussed</span>}{s.nextDueOn && <span className="text-xs text-muted">next {fmtDate(s.nextDueOn)}</span>}</div>
                    {s.actions && <div className="text-muted">Actions: {s.actions}</div>}
                    <div className="text-xs text-muted">Supervisor signed {fmtDateTime(s.supervisorSignedAt)} · {s.staffSignedAt ? `Staff signed ${fmtDateTime(s.staffSignedAt)}` : user.id === userId ? <form action={signSupervision.bind(null, s.id)} className="inline"><button className="underline" type="submit">Sign as read and agreed</button></form> : "Awaiting staff signature"}</div>
                  </li>
                ))}
              </ul>
            )}
            {manage && primaryHome && (
              <details className="mt-3 text-sm"><summary className="cursor-pointer text-brand">Record a session</summary>
                <div className="mt-3"><ActionForm action={addSupervision.bind(null, primaryHome, userId)} submitLabel="Record" successMessage="Recorded.">
                  <div className="grid gap-4 sm:grid-cols-3"><DateInput name="heldOn" label="Held on" defaultValue={now} required /><Select name="kind" label="Type" options={[["supervision", "Supervision"], ["probation_review", "Probation review"], ["appraisal", "Annual appraisal"]]} /><DateInput name="nextDueOn" label="Next due" /></div>
                  <Area name="wellbeing" label="Wellbeing and workload" rows={2} /><Area name="caseDiscussion" label="Children discussed — reflections and decisions" rows={3} /><Area name="practiceAndDevelopment" label="Practice, training and development" rows={2} />
                  <label className="flex items-center gap-2"><input type="checkbox" name="safeguardingDiscussed" />Safeguarding discussed</label>
                  <Area name="actions" label="Actions agreed" rows={2} />
                </ActionForm></div>
              </details>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="card text-sm">
            <h2 className="mb-2 text-base font-semibold">Training</h2>
            <ul className="space-y-1">
              {MANDATORY_COURSES.map((c) => { const t = latest.get(c); const st = t ? trainingStatus(t.expiresOn, now) : "missing"; return <li key={c} className="flex justify-between gap-2"><span>{c}</span><span className={st === "missing" ? "text-danger" : TS[st]}>{t ? (t.expiresOn ? `exp ${fmtDate(t.expiresOn)}` : fmtDate(t.completedOn)) : "Missing"}</span></li>; })}
              {[...latest.values()].filter((t) => !MANDATORY_COURSES.includes(t.course)).map((t) => <li key={t.id} className="flex justify-between gap-2 text-muted"><span>{t.course}</span><span className={TS[trainingStatus(t.expiresOn, now)]}>{t.expiresOn ? `exp ${fmtDate(t.expiresOn)}` : fmtDate(t.completedOn)}</span></li>)}
            </ul>
            {manage && (
              <details className="mt-3"><summary className="cursor-pointer text-brand">Add training</summary>
                <div className="mt-3"><ActionForm action={addTraining.bind(null, org.id, userId)} submitLabel="Add" successMessage="Added.">
                  <input type="hidden" name="homeId" value={primaryHome ?? ""} />
                  <Select name="course" label="Course" options={[...MANDATORY_COURSES.map((c): [string, string] => [c, c]), ["Other", "Other (type below)"]]} />
                  <Text name="provider" label="Provider" /><div className="grid gap-3 sm:grid-cols-2"><DateInput name="completedOn" label="Completed" defaultValue={now} required /><DateInput name="expiresOn" label="Expires" /></div><Text name="certificateRef" label="Certificate ref" />
                </ActionForm></div>
              </details>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
