import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { listVisibleHomes, primaryOrganisation, listStaff } from "@/lib/homes/queries";
import { ROLE_LABELS, isOrgScope } from "@/lib/rbac";

export default async function OverviewPage() {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) {
    return (
      <div className="card">
        <h1 className="text-lg font-semibold">No active access</h1>
        <p className="mt-2 text-sm text-muted">Your account has no current role. Ask your manager or the system administrator.</p>
      </div>
    );
  }
  const [homesList, staff] = await Promise.all([listVisibleHomes(user, org.id), listStaff(user, org.id)]);
  const activeStaff = staff.filter((s) => !s.revokedAt && (!s.validTo || s.validTo > new Date()));
  const orgWide = user.role ? isOrgScope(user.role) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <p className="text-sm text-muted">
          Signed in as {user.role ? ROLE_LABELS[user.role] : "—"} · {orgWide ? "organisation-wide view" : `${homesList.length} home${homesList.length === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Today's shift" value="Open" href="/shift" />
        <Stat label="Homes" value={homesList.length} href="/homes" />
        <Stat label="Active staff & access" value={activeStaff.length} href="/staff" />
        <Stat label="Audit log" value="Open" href="/audit" />
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold">Homes</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {homesList.map((h) => (
            <Link key={h.id} href={`/homes/${h.id}`} className="card hover:border-brand">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{h.name}</div>
                  <div className="text-sm text-muted">{[h.town, h.postcode].filter(Boolean).join(" · ")}</div>
                </div>
                <span className="pill">URN {h.ofstedUrn ?? "—"}</span>
              </div>
              <div className="mt-3 text-sm text-muted">
                Capacity {h.capacity ?? "—"} · Ages {h.ageRangeMin ?? "—"}–{h.ageRangeMax ?? "—"}
              </div>
            </Link>
          ))}
          {homesList.length === 0 && <p className="text-sm text-muted">No homes visible to your role.</p>}
        </div>
      </section>

      <section className="card">
        <h2 className="text-base font-semibold">What&apos;s built so far</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Daily logs per child per shift, handovers, key-work sessions and the child&apos;s voice, all through the same review-and-lock lifecycle</li>
          <li>Child record to Schedule 3: placement, plan, risk assessments, chronology, documents</li>
          <li>Organisation → home → staff structure with eight roles and scoped visibility</li>
          <li>Sign-in with lockout after repeated failures; sessions expire after 20 minutes idle</li>
          <li>Tamper-evident audit log: append-only at the database level and hash-chained</li>
          <li>Time-boxed access for inspectors and the Reg 44 independent person</li>
        </ul>
        <p className="mt-3 text-sm text-muted">Next: incidents, missing episodes and physical interventions with automatic follow-ups.</p>
      </section>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Link href={href} className="card hover:border-brand">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Link>
  );
}
