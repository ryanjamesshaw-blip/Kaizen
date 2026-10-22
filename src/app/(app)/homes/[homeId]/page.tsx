import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getVisibleHome, listStaff } from "@/lib/homes/queries";
import { audit } from "@/lib/audit";
import { requestMeta } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/rbac";

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

  const staff = (await listStaff(user, home.organisationId)).filter((s) => s.homeId === home.id);

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
        <div className="card"><div className="text-xs uppercase text-muted">Capacity</div><div className="text-xl font-semibold">{home.capacity ?? "—"}</div></div>
        <div className="card"><div className="text-xs uppercase text-muted">Age range</div><div className="text-xl font-semibold">{home.ageRangeMin ?? "—"}–{home.ageRangeMax ?? "—"}</div></div>
        <div className="card"><div className="text-xs uppercase text-muted">Children placed</div><div className="text-xl font-semibold text-muted">Slice 2</div></div>
      </div>

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
