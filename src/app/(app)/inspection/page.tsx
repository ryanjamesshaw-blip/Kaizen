import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { listVisibleHomes, primaryOrganisation } from "@/lib/homes/queries";
import { listVisibleChildren, fullName } from "@/lib/children/queries";
import { can } from "@/lib/rbac";
import { fmtDate } from "@/components/record-status";

export const metadata = { title: "Inspection" };

/** Landing page for an inspector (or anyone preparing for inspection): everything in one place. */
export default async function InspectionPage() {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) return null;
  const homesList = await listVisibleHomes(user, org.id);
  const kids = await listVisibleChildren(user, org.id);
  const grant = user.grants.find((g) => g.role === "inspector" && !g.revokedAt);
  const isInspector = user.role === "inspector";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{isInspector ? "Inspection access" : "Inspection readiness"}</h1>
        {isInspector && grant ? <p className="text-sm text-muted">Read-only access to {homesList.map((h) => h.name).join(", ")} from {fmtDate(grant.validFrom)} to {fmtDate(grant.validTo)}. Everything you open is logged, as it is for every user.</p>
          : <p className="text-sm text-muted">What an inspector sees, and the evidence pack you can hand over. Inspector accounts are read-only and time-boxed; grant one from Staff &amp; access.</p>}
      </div>
      {homesList.map((h) => {
        const scope = { organisationId: org.id, homeId: h.id };
        const canExport = can(user.grants, "inspection:export", scope);
        return (
          <section key={h.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{h.name} <span className="font-normal text-muted">· URN {h.ofstedUrn ?? "—"}</span></h2>{canExport && <div className="flex gap-2"><Link href={`/homes/${h.id}/mock-inspection`} className="btn-ghost">Mock inspection</Link><Link href={`/homes/${h.id}/evidence-pack`} className="btn">Evidence pack</Link></div>}</div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <L href={`/homes/${h.id}`} t="Home overview" d="Children, team, running the home" />
              <L href={`/homes/${h.id}/documents`} t="Statement of Purpose, Children's Guide, policies" d="Reg 16, Reg 34" />
              <L href={`/incidents?home=${h.id}`} t="Incidents, restraint, missing" d="Reg 12, 20, 35, 40" />
              <L href={`/governance?home=${h.id}`} t="Reg 44 visits and Reg 45 reviews" d="Monthly and six-monthly" />
              <L href={`/homes/${h.id}/team`} t="Staff fitness, supervision, training" d="Reg 32, 33, Schedule 2" />
              <L href={`/homes/${h.id}/checks`} t="Fire and safety checks" d="Reg 25, Schedule 4 para 6" />
              <L href={`/homes/${h.id}/medication`} t="Medication" d="Reg 23" />
              <L href={`/homes/${h.id}/money`} t="Petty cash" d="Reg 47, Schedule 4 para 7" />
              <L href={`/homes/${h.id}/visitors`} t="Visitors book" d="Schedule 4 para 5" />
              <L href={`/shift?home=${h.id}`} t="Daily logs and handovers" d="Reg 36" />
              <L href={`/tasks`} t="Follow-up actions" d="Open and overdue" />
              <L href={`/audit`} t="Audit log" d="Reg 38" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">Children placed</h3>
            <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">{kids.filter((k) => k.homeId === h.id).map((k) => <li key={k.id}><Link href={`/children/${k.id}`} className="text-brand hover:underline">{fullName(k)}</Link> <span className="text-muted">· record, daily, medication, money</span></li>)}</ul>
          </section>
        );
      })}
    </div>
  );
}
function L({ href, t, d }: { href: string; t: string; d: string }) { return <Link href={href} className="rounded-md border border-line p-2 hover:border-brand"><div className="font-medium">{t}</div><div className="text-xs text-muted">{d}</div></Link>; }
