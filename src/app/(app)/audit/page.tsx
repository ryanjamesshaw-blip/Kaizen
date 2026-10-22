import { requireUser } from "@/lib/auth/guard";
import { primaryOrganisation } from "@/lib/homes/queries";
import { listAuditEvents, verifyAuditChain } from "@/lib/audit/queries";
import { can } from "@/lib/rbac";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) return null;
  if (!can(user.grants, "audit:read", { organisationId: org.id }) &&
      !user.grants.some((g) => can([g], "audit:read", { organisationId: org.id, homeId: g.homeId }))) {
    return <p className="text-sm text-muted">Your role cannot view the audit log.</p>;
  }
  const canVerify = can(user.grants, "audit:verify", { organisationId: org.id });
  const [events, chain] = await Promise.all([
    listAuditEvents(user, org.id, 200),
    canVerify ? verifyAuditChain() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        {chain && (
          <span className={`pill ${chain.ok ? "text-ok" : "text-danger"}`}>
            {chain.ok ? `Chain intact · ${chain.count} events` : `Chain broken at #${chain.brokenAt}`}
          </span>
        )}
      </div>
      <p className="text-sm text-muted">Newest first. Entries cannot be edited or deleted, by anyone.</p>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>#</th><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Reason</th><th>IP</th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.seq}>
                <td className="font-mono text-xs text-muted">{e.seq}</td>
                <td className="whitespace-nowrap">{e.occurredAt.toLocaleString("en-GB")}</td>
                <td>{e.actorName ?? <span className="text-muted">—</span>}<div className="text-xs text-muted">{e.actorRole ?? ""}</div></td>
                <td><span className="pill">{e.action}</span></td>
                <td>{e.entityType}<div className="font-mono text-xs text-muted">{e.entityId ?? ""}</div></td>
                <td className="text-muted">{e.reason ?? ""}</td>
                <td className="font-mono text-xs text-muted">{e.ipAddress ?? ""}</td>
              </tr>
            ))}
            {events.length === 0 && <tr><td colSpan={7} className="text-muted">Nothing logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
