import { requireUser } from "@/lib/auth/guard";
import { primaryOrganisation } from "@/lib/homes/queries";
import { listOpenTasks, taskIsMine } from "@/lib/incidents/queries";
import { can } from "@/lib/rbac";
import { TaskList } from "@/components/task-list";
import { nowMs } from "@/lib/time";

export const metadata = { title: "Follow-ups" };

export default async function TasksPage() {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) return null;
  const rows = (await listOpenTasks(user, org.id)).map((r) => ({ t: r.t, childName: r.childFirst ? `${r.childFirst} ${r.childLast}` : null, incidentType: r.incidentType }));
  const mine = rows.filter((r) => taskIsMine(user, r.t));
  const others = rows.filter((r) => !taskIsMine(user, r.t));
  const isSenior = ["deputy", "registered_manager", "responsible_individual", "director"].includes(user.role ?? "");
  const canAct = rows.some((r) => can(user.grants, "child:write", { organisationId: org.id, homeId: r.t.homeId }));
  const now = nowMs();
  const overdue = rows.filter((r) => r.t.dueAt.getTime() < now).length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Follow-ups</h1>
        <p className="text-sm text-muted">{rows.length} open{overdue ? <span className="text-danger"> · {overdue} overdue</span> : null}. Created automatically from incidents; each cites the regulation it serves.</p>
      </div>
      <section className="card"><h2 className="mb-2 text-base font-semibold">Yours · {mine.length}</h2><TaskList rows={mine} canAct={canAct} showChild isSenior={isSenior} isMine={() => true} now={now} /></section>
      <section className="card"><h2 className="mb-2 text-base font-semibold">Everyone else&apos;s · {others.length}</h2><TaskList rows={others} canAct={canAct} showChild isSenior={isSenior} now={now} /></section>
    </div>
  );
}
