import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getVisibleHome, listStaff } from "@/lib/homes/queries";
import { audit } from "@/lib/audit";
import { requestMeta } from "@/lib/auth/session";
import { ROLE_LABELS, can } from "@/lib/rbac";
import Link from "next/link";
import { listVisibleChildren, riskOverviewForHome, ageOn, fullName } from "@/lib/children/queries";
import { isOverdue } from "@/lib/records/lifecycle";
import { LevelPill, StatusPill, fmtDate } from "@/components/record-status";
import { homeIncidentSummary } from "@/lib/incidents/queries";
import { checksBoard, staffCompliance, homeDocumentsList } from "@/lib/operations/queries";
import { nowMs } from "@/lib/time";

export default async function HomePage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = await params;
  const user = await requireUser();
  const home = await getVisibleHome(user, homeId);
  if (!home) notFound();

  // Reads of home-level data are audited (hard rule #4).
  await audit({
    organisationId: home.organisationId,
    homeId: home.id,
    actorUserId: user.id,
    actorRole: user.role,
    action: "read",
    entityType: "home",
    entityId: home.id,
    ...(await requestMeta()),
  });

  const [staffAll, kids, risks, inc] = await Promise.all([
    listStaff(user, home.organisationId),
    listVisibleChildren(user, home.organisationId, home.id),
    riskOverviewForHome(user, home.organisationId, home.id),
    homeIncidentSummary(home.id),
  ]);
  const now = new Date(nowMs());
  const [checks, team, hdocs] = await Promise.all([checksBoard(home.id, now), staffCompliance(home.organisationId, home.id, now), homeDocumentsList(home.id)]);
  const checksOverdue = checks.filter((c) => c.status === "overdue").length;
  const supOverdue = team.filter((t) => t.supervisionStatus === "overdue" || t.supervisionStatus === "never").length;
  const sch2 = team.filter((t) => t.schedule2Missing.length > 0).length;
  const trainingExpired = team.reduce((n, t) => n + t.training.expired, 0);
  const sopOk = hdocs.some((d) => d.current && d.d.kind === "statement_of_purpose");
  const ops = [
    { href: `/homes/${home.id}/team`, label: "Team compliance", status: supOverdue || sch2 ? `${supOverdue} supervision overdue · ${sch2} incomplete files` : "In order", bad: !!(supOverdue || sch2) },
    { href: `/homes/${home.id}/checks`, label: "Safety checks & fire", status: checks.length === 0 ? "Not set up" : checksOverdue ? `${checksOverdue} overdue` : "All in date", bad: checks.length === 0 || checksOverdue > 0 },
    { href: `/homes/${home.id}/medication`, label: "Medication", status: "Register & MAR", bad: false },
    { href: `/homes/${home.id}/maintenance`, label: "Maintenance", status: "Log", bad: false },
    { href: `/homes/${home.id}/money`, label: "Petty cash", status: "Ledger", bad: false },
    { href: `/homes/${home.id}/documents`, label: "Statement of Purpose & policies", status: sopOk ? "SoP on file" : "No Statement of Purpose", bad: !sopOk },
    { href: `/governance?home=${home.id}`, label: "Governance (Reg 44 / 45)", status: "Visits and reviews", bad: false },
  ];
  const staff = staffAll.filter((s) => s.homeId === home.id);
  const overdue = risks.filter((r) => isOverdue(r.reviewDueOn) && r.status !== "locked");
  const canAdmit = can(user.grants, "child:write", { organisationId: home.organisationId, homeId: home.id });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{home.name}</h1>
          <p className="text-sm text-muted">
            {[home.addressLine1, home.addressLine2, home.town, home.postcode].filter(Boolean).join(", ")}
          </p>
        </div>
        <span className="pill">Ofsted URN {home.ofstedUrn ?? "—"}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href={`/incidents?home=${home.id}`} className="card hover:border-brand"><div className="text-xs uppercase text-muted">Incidents, last 30 days</div><div className="text-xl font-semibold">{inc.last30}<span className="text-base font-normal text-muted"> · {inc.pi30} restraint · {inc.missing30} missing</span></div></Link>
        <Link href="/tasks" className="card hover:border-brand"><div className="text-xs uppercase text-muted">Open follow-ups</div><div className={`text-xl font-semibold ${inc.tasksOverdue ? "text-danger" : ""}`}>{inc.tasksOpen}{inc.tasksOverdue ? <span className="text-base font-normal"> · {inc.tasksOverdue} overdue</span> : null}</div></Link>
        <div className="card"><div className="text-xs uppercase text-muted">Capacity</div><div className="text-xl font-semibold">{home.capacity ?? "—"}</div></div>
        <div className="card"><div className="text-xs uppercase text-muted">Age range</div><div className="text-xl font-semibold">{home.ageRangeMin ?? "—"}–{home.ageRangeMax ?? "—"}</div></div>
        <div className="card"><div className="text-xs uppercase text-muted">Children placed</div><div className="text-xl font-semibold">{kids.length}{home.capacity ? <span className="text-base font-normal text-muted"> / {home.capacity}</span> : null}</div></div>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold">Running the home</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ops.map((o) => <Link key={o.href} href={o.href} className={`card hover:border-brand ${o.bad ? "border-red-200" : ""}`}><div className="font-medium">{o.label}</div><div className={`text-sm ${o.bad ? "text-danger" : "text-muted"}`}>{o.status}</div></Link>)}
        </div>
        {trainingExpired > 0 && <p className="mt-2 text-sm text-danger">{trainingExpired} training certificate{trainingExpired > 1 ? "s" : ""} expired across the team.</p>}
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Children</h2>
          {canAdmit && <Link href={`/children/new?home=${home.id}`} className="btn-ghost">Admit a child</Link>}
        </div>
        {kids.length === 0 ? <p className="text-sm text-muted">No children currently placed.</p> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Age</th><th>Key worker</th><th>Risk reviews</th></tr></thead>
            <tbody>
              {kids.map((c) => {
                const mine = risks.filter((r) => r.childId === c.id);
                const od = mine.filter((r) => isOverdue(r.reviewDueOn) && r.status !== "locked").length;
                return (
                  <tr key={c.id}>
                    <td><Link href={`/children/${c.id}`} className="font-medium text-brand hover:underline">{fullName(c)}</Link></td>
                    <td>{ageOn(c.dateOfBirth)}</td>
                    <td>{c.keyWorkerName ?? <span className="text-muted">Not assigned</span>}</td>
                    <td>{mine.length === 0 ? <span className="text-muted">None</span> : od > 0 ? <span className="text-danger">{od} overdue</span> : <span className="text-ok">Up to date</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {overdue.length > 0 && (
        <section className="card border-red-200">
          <h2 className="mb-3 text-base font-semibold text-danger">Overdue risk reviews</h2>
          <table className="table">
            <thead><tr><th>Child</th><th>Assessment</th><th>Level</th><th>Status</th><th>Was due</th></tr></thead>
            <tbody>
              {overdue.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/children/${r.childId}`} className="text-brand hover:underline">{r.childFirst} {r.childLast}</Link></td>
                  <td><Link href={`/children/${r.childId}/risk/${r.id}`} className="hover:underline">{r.title}</Link></td>
                  <td><LevelPill level={r.level} /></td>
                  <td><StatusPill status={r.status} /></td>
                  <td className="text-danger">{fmtDate(r.reviewDueOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 text-base font-semibold">Team and access</h2>
        <table className="table">
          <thead><tr><th>Name</th><th>Role</th><th>Access</th><th>Last sign-in</th></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.membershipId}>
                <td>{s.fullName}<div className="text-xs text-muted">{s.email}</div></td>
                <td>{ROLE_LABELS[s.role]}</td>
                <td>{s.revokedAt ? <span className="pill">Revoked</span> : s.validTo ? <span className="pill">Until {s.validTo.toLocaleDateString("en-GB")}</span> : <span className="pill">Ongoing</span>}</td>
                <td className="text-muted">{s.lastLoginAt ? s.lastLoginAt.toLocaleString("en-GB") : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
