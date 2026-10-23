import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { followUpTasks } from "@/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { listVisibleHomes, primaryOrganisation } from "@/lib/homes/queries";
import { latestRun } from "@/lib/engine/run";
import { runChecksNow } from "@/lib/engine/actions";
import { RULES, complianceScore, scoreBand } from "@/lib/rules/engine";
import { INCIDENT_RULES } from "@/lib/rules/incidents";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { fmtDateTime } from "@/components/record-status";

export const metadata = { title: "Rules and compliance" };
const TONE = { ok: "text-ok", warn: "text-amber-700", bad: "text-danger" };

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ home?: string }> }) {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) return null;
  const sp = await searchParams;
  const homesList = await listVisibleHomes(user, org.id);
  const home = homesList.find((h) => h.id === sp.home) ?? homesList[0];
  if (!home) return null;
  const canRun = can(user.grants, "home:manage", { organisationId: org.id, homeId: home.id });
  const [run, open] = await Promise.all([
    latestRun(home.id),
    db.select({ ruleKey: followUpTasks.ruleKey, title: followUpTasks.title, id: followUpTasks.id, dueAt: followUpTasks.dueAt }).from(followUpTasks).where(and(eq(followUpTasks.homeId, home.id), eq(followUpTasks.sourceType, "engine"), eq(followUpTasks.status, "open"))),
  ]);
  const counts: Record<string, number> = {};
  for (const t of open) counts[t.ruleKey] = (counts[t.ruleKey] ?? 0) + 1;
  const { score, deductions } = complianceScore(Object.fromEntries(Object.entries(counts).filter(([k]) => !k.endsWith(".escalated"))));
  const band = scoreBand(score);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Compliance · {home.name}</h1><p className="text-sm text-muted">The audit engine checks every rule below continuously and creates, resolves and escalates follow-ups on its own. Last run {run ? fmtDateTime(run.ranAt) : "never"}.</p></div>
        <div className="flex items-center gap-3">
          {homesList.length > 1 && <div className="flex gap-1 text-sm">{homesList.map((h) => <Link key={h.id} href={`/rules?home=${h.id}`} className={`pill ${h.id === home.id ? "border-brand text-brand" : ""}`}>{h.name}</Link>)}</div>}
          {canRun && <form action={runChecksNow.bind(null, home.id)}><button className="btn" type="submit">Run checks now</button></form>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card text-center"><div className="text-xs uppercase text-muted">Compliance score</div><div className={`text-5xl font-semibold ${TONE[band.tone]}`}>{score}</div><div className={`text-sm ${TONE[band.tone]}`}>{band.label}</div><div className="mt-1 text-xs text-muted">100 minus weighted deductions for open findings, capped per rule</div></div>
        <div className="card md:col-span-2"><div className="mb-2 text-sm font-semibold">What is costing points</div>
          {deductions.length === 0 ? <p className="text-sm text-ok">Nothing — every rule is satisfied.</p> : (
            <ul className="space-y-1 text-sm">{deductions.map((d) => { const r = RULES.find((x) => x.key === d.key)!; return <li key={d.key} className="flex justify-between gap-2"><span>{r.name} <span className="text-muted">· {d.findings} finding{d.findings > 1 ? "s" : ""} · {r.regulation}</span></span><span className="font-medium text-danger">−{d.points}</span></li>; })}</ul>
          )}
        </div>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 text-base font-semibold">Continuous rules · {RULES.length}</h2>
        <table className="table">
          <thead><tr><th>Rule</th><th>Regulation</th><th>Owner</th><th>Escalates</th><th>Open now</th></tr></thead>
          <tbody>
            {RULES.map((r) => { const n = counts[r.key] ?? 0; const esc = counts[`${r.key}.escalated`] ?? 0; return (
              <tr key={r.key}>
                <td><div className="font-medium">{r.name}</div><div className="text-xs text-muted">{r.description}</div></td>
                <td className="whitespace-nowrap">{r.regulation}</td>
                <td className="whitespace-nowrap">{ROLE_LABELS[r.ownerRole]}</td>
                <td className="whitespace-nowrap text-muted">{r.escalateTo ? `${ROLE_LABELS[r.escalateTo]} after ${r.escalateAfterDays}d` : "—"}</td>
                <td className={n ? "font-medium text-danger" : "text-ok"}>{n || "0"}{esc ? <span className="text-xs"> · {esc} escalated</span> : null}</td>
              </tr>); })}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 text-base font-semibold">Incident rules · {INCIDENT_RULES.length}</h2>
        <p className="mb-2 text-sm text-muted">Applied the moment an incident is submitted.</p>
        <table className="table">
          <thead><tr><th>Applies to</th><th>Creates</th><th>Owner</th><th>Due</th><th>Regulation</th></tr></thead>
          <tbody>{INCIDENT_RULES.map((r) => <tr key={r.key}><td className="whitespace-nowrap">{r.appliesTo === "all" ? "Every incident" : r.appliesTo.map((t) => t.replace(/_/g, " ")).join(", ")}{r.when ? <span className="text-xs text-muted"> (conditional)</span> : ""}</td><td>{r.task.title}</td><td className="whitespace-nowrap">{ROLE_LABELS[r.task.ownerRole]}</td><td className="whitespace-nowrap">{r.task.dueHours < 24 ? `${r.task.dueHours}h` : `${r.task.dueHours / 24}d`}</td><td>{r.task.regulation}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}
