import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { visitorsLog, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { getVisibleHome } from "@/lib/homes/queries";
import { signInVisitor, signOutVisitor } from "@/lib/inspection/actions";
import { can } from "@/lib/rbac";
import { ActionForm, Text } from "@/components/form";
import { fmtDateTime } from "@/components/record-status";

export default async function VisitorsPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = await params;
  const user = await requireUser();
  const home = await getVisibleHome(user, homeId);
  if (!home) notFound();
  const canWrite = can(user.grants, "child:write", { organisationId: home.organisationId, homeId });
  const rows = await db.select({ v: visitorsLog, byName: users.fullName }).from(visitorsLog).leftJoin(users, eq(users.id, visitorsLog.signedInBy)).where(eq(visitorsLog.homeId, homeId)).orderBy(desc(visitorsLog.arrivedAt)).limit(100);
  const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted"><Link href={`/homes/${homeId}`} className="hover:underline">{home.name}</Link> · Visitors book</div>
      <h1 className="text-2xl font-semibold tracking-tight">Visitors book <span className="text-base font-normal text-muted">(Schedule 4 para 5)</span></h1>
      {canWrite && (
        <div className="card"><ActionForm action={signInVisitor.bind(null, homeId)} submitLabel="Sign in" successMessage="Signed in.">
          <div className="grid gap-3 sm:grid-cols-4"><Text name="visitorName" label="Name" required /><Text name="organisation" label="Organisation" /><Text name="purpose" label="Purpose" required placeholder="Social worker visit, contractor, inspection" /><Text name="arrivedAt" label="Arrived" type="datetime-local" defaultValue={nowLocal()} required /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="idChecked" defaultChecked />ID checked</label>
        </ActionForm></div>
      )}
      <div className="card"><table className="table"><thead><tr><th>Arrived</th><th>Name</th><th>Organisation</th><th>Purpose</th><th>ID</th><th>Left</th><th>Signed in by</th></tr></thead><tbody>
        {rows.map(({ v, byName }) => <tr key={v.id}><td className="whitespace-nowrap">{fmtDateTime(v.arrivedAt)}</td><td>{v.visitorName}</td><td>{v.organisation}</td><td>{v.purpose}</td><td>{v.idChecked ? "✓" : <span className="text-amber-700">not checked</span>}</td><td>{v.leftAt ? fmtDateTime(v.leftAt) : canWrite ? <form action={signOutVisitor.bind(null, v.id)}><button className="btn-ghost py-0.5 text-xs" type="submit">Sign out</button></form> : <span className="text-muted">on site</span>}</td><td className="text-muted">{byName}</td></tr>)}
        {rows.length === 0 && <tr><td colSpan={7} className="text-muted">No visitors recorded.</td></tr>}
      </tbody></table></div>
    </div>
  );
}
