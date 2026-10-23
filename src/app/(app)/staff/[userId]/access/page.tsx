import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { primaryOrganisation } from "@/lib/homes/queries";
import { accessTrail } from "@/lib/inspection/pack";
import { can } from "@/lib/rbac";
import { fmtDate, fmtDateTime } from "@/components/record-status";
import { nowMs } from "@/lib/time";

/** Everything one account did — what an inspector opened, or what a departed member of staff touched. */
export default async function AccessPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) notFound();
  const [target] = await db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) notFound();
  const ms = await db.select().from(memberships).where(eq(memberships.userId, userId));
  // Org-level audit readers see anyone; home-level readers see accounts attached to their home.
  const allowed = can(user.grants, "audit:read", { organisationId: org.id }) || ms.some((m) => m.homeId && can(user.grants, "audit:read", { organisationId: org.id, homeId: m.homeId }));
  if (!allowed) notFound();
  const from = ms.reduce((a, m) => (m.validFrom < a ? m.validFrom : a), new Date(nowMs()));
  const rows = await accessTrail(userId, from, new Date(nowMs()));
  const reads = rows.filter((r) => r.action === "read").length;
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted"><Link href={`/staff/${userId}`} className="hover:underline">{target.fullName}</Link> · Access trail</div>
      <h1 className="text-2xl font-semibold tracking-tight">Access trail — {target.fullName}</h1>
      <p className="text-sm text-muted">{rows.length} events since {fmtDate(from)} · {reads} record views. {ms.some((m) => m.role === "inspector") && "This is an inspector account: the trail is the complete record of what was opened."}</p>
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>#</th><th>When</th><th>Action</th><th>Entity</th><th>IP</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.seq}><td className="font-mono text-xs text-muted">{r.seq}</td><td className="whitespace-nowrap">{fmtDateTime(r.occurredAt)}</td><td><span className="pill">{r.action}</span></td><td>{r.entityType}<div className="font-mono text-xs text-muted">{r.entityId}</div></td><td className="font-mono text-xs text-muted">{r.ipAddress}</td></tr>)}
        {rows.length === 0 && <tr><td colSpan={5} className="text-muted">No activity.</td></tr>}
      </tbody></table></div>
    </div>
  );
}
