import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { reg44Visits, reg45Reviews, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { listVisibleHomes, primaryOrganisation } from "@/lib/homes/queries";
import { homeMetrics } from "@/lib/governance/metrics";
import { createReg44, createReg45 } from "@/lib/governance/actions";
import { can } from "@/lib/rbac";
import { ActionForm, DateInput } from "@/components/form";
import { StatusPill, fmtDate } from "@/components/record-status";
import { nowMs } from "@/lib/time";

export const metadata = { title: "Governance" };
const ST: Record<string, string> = { ok: "text-ok", due_soon: "text-amber-700", overdue: "text-danger" };

export default async function GovernancePage({ searchParams }: { searchParams: Promise<{ home?: string }> }) {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  if (!org) return null;
  const sp = await searchParams;
  const homesList = await listVisibleHomes(user, org.id);
  const home = homesList.find((h) => h.id === sp.home) ?? homesList[0];
  if (!home) return null;
  const scope = { organisationId: org.id, homeId: home.id };
  if (!can(user.grants, "home:read", scope)) return null;
  const now = new Date(nowMs());
  const from = new Date(now.getTime() - 183 * 86_400_000);
  const [m, visits, reviews] = await Promise.all([
    homeMetrics(home.id, from, now, now),
    db.select({ v: reg44Visits, visitor: users.fullName }).from(reg44Visits).leftJoin(users, eq(users.id, reg44Visits.visitorUserId)).where(and(eq(reg44Visits.homeId, home.id), isNull(reg44Visits.supersedesId))).orderBy(desc(reg44Visits.visitedOn)).limit(12),
    db.select().from(reg45Reviews).where(and(eq(reg45Reviews.homeId, home.id), isNull(reg45Reviews.supersedesId))).orderBy(desc(reg45Reviews.periodTo)).limit(6),
  ]);
  const canReg44 = can(user.grants, "reg44:write", scope) || can(user.grants, "home:manage", scope);
  const canManage = can(user.grants, "home:manage", scope);
  const lastReview = reviews[0];
  const defaultFrom = lastReview ? new Date(lastReview.periodTo.getTime() + 86_400_000) : new Date(now.getTime() - 182 * 86_400_000);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">Governance · {home.name}</h1><p className="text-sm text-muted">Regulation 44 visits and Regulation 45 quality of care reviews.</p></div>
        {homesList.length > 1 && <div className="flex gap-1 text-sm">{homesList.map((h) => <Link key={h.id} href={`/governance?home=${h.id}`} className={`pill ${h.id === home.id ? "border-brand text-brand" : ""}`}>{h.name}</Link>)}</div>}
      </div>

      {m && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={`card ${m.governance.reg44Status === "overdue" ? "border-red-200" : ""}`}><div className="text-xs uppercase text-muted">Reg 44 — monthly independent visit</div><div className={`text-lg font-semibold ${ST[m.governance.reg44Status]}`}>{m.governance.reg44Status === "overdue" ? "Overdue" : m.governance.reg44Status === "due_soon" ? "Due soon" : "On track"}</div><div className="text-sm text-muted">Last {fmtDate(m.governance.lastReg44)} · next due {fmtDate(m.governance.reg44Due)}</div></div>
          <div className={`card ${m.governance.reg45Status === "overdue" ? "border-red-200" : ""}`}><div className="text-xs uppercase text-muted">Reg 45 — six-monthly quality review</div><div className={`text-lg font-semibold ${ST[m.governance.reg45Status]}`}>{m.governance.reg45Status === "overdue" ? "Overdue" : m.governance.reg45Status === "due_soon" ? "Due soon" : "On track"}</div><div className="text-sm text-muted">Last period ended {fmtDate(m.governance.lastReg45To)} · next due {fmtDate(m.governance.reg45Due)}</div></div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 text-base font-semibold">Reg 44 visits</h2>
          {visits.length === 0 ? <p className="text-sm text-muted">None recorded.</p> : (
            <ul className="divide-y divide-line text-sm">{visits.map(({ v, visitor }) => <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><div><Link href={`/governance/reg44/${v.id}`} className="font-medium text-brand hover:underline">{fmtDate(v.visitedOn)}</Link> <span className="text-muted">· {visitor}{v.announced ? "" : " · unannounced"}</span></div><div className="flex items-center gap-2"><StatusPill status={v.status} />{v.safeguardingEffective === false && <span className="pill border-red-200 text-red-800">safeguarding concern</span>}{!v.ofstedCopyOn && v.status !== "draft" && <span className="pill text-amber-700">Ofsted copy pending</span>}</div></li>)}</ul>
          )}
          {canReg44 && (
            <details className="mt-3 text-sm"><summary className="cursor-pointer text-brand">Record a visit</summary>
              <div className="mt-2"><ActionForm action={createReg44.bind(null, home.id)} submitLabel="Start report"><DateInput name="visitedOn" label="Date of visit" defaultValue={now} required /><label className="flex items-center gap-2"><input type="checkbox" name="announced" />Announced visit</label></ActionForm></div>
            </details>
          )}
        </section>

        <section className="card">
          <h2 className="mb-2 text-base font-semibold">Reg 45 reviews</h2>
          {reviews.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
            <ul className="divide-y divide-line text-sm">{reviews.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><Link href={`/governance/reg45/${r.id}`} className="font-medium text-brand hover:underline">{fmtDate(r.periodFrom)} – {fmtDate(r.periodTo)}</Link><div className="flex items-center gap-2"><StatusPill status={r.status} />{r.riSignedAt && <span className="pill text-ok">RI signed</span>}{!r.ofstedCopyOn && r.status === "locked" && <span className="pill text-amber-700">Ofsted copy pending</span>}</div></li>)}</ul>
          )}
          {canManage && (
            <details className="mt-3 text-sm"><summary className="cursor-pointer text-brand">Start a review</summary>
              <div className="mt-2"><ActionForm action={createReg45.bind(null, home.id)} submitLabel="Create with data snapshot"><div className="grid gap-3 sm:grid-cols-2"><DateInput name="periodFrom" label="Period from" defaultValue={defaultFrom} required /><DateInput name="periodTo" label="Period to" defaultValue={now} required /></div><p className="text-xs text-muted">The system fills in the numbers for the period — incidents, missing, restraint, follow-ups, logs, supervision, training, checks — so the review starts from evidence.</p></ActionForm></div>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
