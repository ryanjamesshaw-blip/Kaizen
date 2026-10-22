import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { listStaff, listVisibleHomes, primaryOrganisation } from "@/lib/homes/queries";
import { revokeAccess } from "@/lib/staff/actions";
import { ROLE_LABELS, can, isOrgScope } from "@/lib/rbac";
import { roleEnum, type Role } from "@/db/schema";
import { GrantForm } from "@/components/grant-form";
import { fmtDate, fmtDateTime } from "@/components/record-status";

export const metadata = { title: "Staff & access" };

export default async function StaffPage() {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) return null;
  const [staff, homesList] = await Promise.all([listStaff(user, org.id), listVisibleHomes(user, org.id)]);
  const now = new Date();
  const orgManage = can(user.grants, "org:manage", { organisationId: org.id });
  const grantHomes = homesList.filter((h) => can(user.grants, "access:grant", { organisationId: org.id, homeId: h.id }));
  const roles = (roleEnum.enumValues as Role[]).filter((r) => (isOrgScope(r) ? orgManage : grantHomes.length > 0));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Staff & access</h1>

      {roles.length > 0 && (
        <section className="card">
          <h2 className="mb-1 text-base font-semibold">Grant access</h2>
          <p className="mb-4 text-sm text-muted">Creates the account if it doesn&apos;t exist. Inspector and Reg 44 access is read-only and must have an end date; it switches off automatically.</p>
          <GrantForm organisationId={org.id} homes={grantHomes} roles={roles} />
        </section>
      )}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Role</th><th>Home</th><th>Access</th><th>Last sign-in</th><th></th></tr></thead>
          <tbody>
            {staff.map((s) => {
              const expired = s.validTo && s.validTo <= now;
              const active = !s.revokedAt && !expired;
              const mayRevoke = active && s.userId !== user.id && (isOrgScope(s.role) ? orgManage : can(user.grants, "access:grant", { organisationId: org.id, homeId: s.homeId }));
              return (
                <tr key={s.membershipId} className={active ? "" : "opacity-60"}>
                  <td><Link href={`/staff/${s.userId}`} className="font-medium text-brand hover:underline">{s.fullName}</Link><div className="text-xs text-muted">{s.email}</div></td>
                  <td>{ROLE_LABELS[s.role]}</td>
                  <td>{s.homeName ?? <span className="text-muted">All homes</span>}</td>
                  <td>{s.revokedAt ? <span className="pill">Revoked {fmtDate(s.revokedAt)}</span> : expired ? <span className="pill">Expired</span> : s.validTo ? <span className="pill">Until {fmtDate(s.validTo)}</span> : <span className="pill">Ongoing</span>}</td>
                  <td className="text-muted">{s.lastLoginAt ? fmtDateTime(s.lastLoginAt) : "Never"}</td>
                  <td>
                    {mayRevoke && (
                      <form action={revokeAccess.bind(null, s.membershipId)} className="flex items-center gap-1">
                        <input name="reason" placeholder="Reason" className="input py-1 text-xs" aria-label="Reason for revoking" />
                        <button className="btn-ghost text-xs" type="submit">Revoke</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
