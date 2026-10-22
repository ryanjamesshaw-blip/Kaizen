import { requireUser } from "@/lib/auth/guard";
import { listStaff, primaryOrganisation } from "@/lib/homes/queries";
import { ROLE_LABELS, can } from "@/lib/rbac";

export const metadata = { title: "Staff & access" };

export default async function StaffPage() {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) return null;
  const staff = await listStaff(user, org.id);
  const now = new Date();
  const canGrant = can(user.grants, "access:grant", { organisationId: org.id });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Staff & access</h1>
        {canGrant && <span className="text-sm text-muted">Granting and revoking access arrives in this slice&apos;s next pass.</span>}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Role</th><th>Home</th><th>Access</th><th>Last sign-in</th></tr></thead>
          <tbody>
            {staff.map((s) => {
              const expired = s.validTo && s.validTo <= now;
              return (
                <tr key={s.membershipId} className={s.revokedAt || expired ? "opacity-60" : ""}>
                  <td>{s.fullName}<div className="text-xs text-muted">{s.email}</div></td>
                  <td>{ROLE_LABELS[s.role]}</td>
                  <td>{s.homeName ?? <span className="text-muted">All homes</span>}</td>
                  <td>
                    {s.revokedAt ? <span className="pill">Revoked</span>
                      : expired ? <span className="pill">Expired</span>
                      : s.validTo ? <span className="pill">Until {s.validTo.toLocaleDateString("en-GB")}</span>
                      : <span className="pill">Ongoing</span>}
                  </td>
                  <td className="text-muted">{s.lastLoginAt ? s.lastLoginAt.toLocaleString("en-GB") : "Never"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
