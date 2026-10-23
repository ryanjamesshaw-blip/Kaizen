import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { followUpTasks } from "@/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { getVisibleHome } from "@/lib/homes/queries";
import { homeMetrics } from "@/lib/governance/metrics";
import { draftsFor } from "@/lib/ai/queries";
import { createActionsFromDraft, runMockInspection } from "@/lib/ai/actions";
import { isConfigured } from "@/lib/ai/client";
import { can } from "@/lib/rbac";
import { scoreInspection, JUDGEMENT_LABEL, type AreaResult, type Judgement } from "@/lib/rules/inspection";
import { ActionForm } from "@/components/form";
import { AiDraftPanel } from "@/components/ai-draft";
import { fmtDate } from "@/components/record-status";
import { nowMs } from "@/lib/time";

export const metadata = { title: "Mock inspection" };
const TONE: Record<Judgement, string> = { outstanding: "text-ok border-green-200 bg-green-50", good: "text-ok border-green-200", requires_improvement: "text-amber-800 border-amber-200 bg-amber-50", inadequate: "text-danger border-red-200 bg-red-50" };

export default async function MockInspectionPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = await params;
  const user = await requireUser();
  const home = await getVisibleHome(user, homeId);
  if (!home) notFound();
  const scope = { organisationId: home.organisationId, homeId };
  if (!can(user.grants, "inspection:export", scope)) return <p className="text-sm text-muted">Your role cannot run a mock inspection.</p>;
  const now = new Date(nowMs()); const from = new Date(now); from.setMonth(from.getMonth() - 12);
  const [m, open, ai] = await Promise.all([
    homeMetrics(homeId, from, now, now),
    db.select().from(followUpTasks).where(and(eq(followUpTasks.homeId, homeId), eq(followUpTasks.sourceType, "engine"), eq(followUpTasks.status, "open"))),
    draftsFor("mock_inspection", homeId),
  ]);
  if (!m) notFound();
  const counts: Record<string, number> = {}; for (const t of open) counts[t.ruleKey] = (counts[t.ruleKey] ?? 0) + 1;
  const scored = scoreInspection(m, counts);
  const canManage = can(user.grants, "home:manage", scope);
  const latest = ai.drafts[0];
  const actions = (latest?.outputJson?.actions as Array<{ title: string; owner: string; dueDays: number; regulation: string }> | undefined) ?? [];

  return (
    <div className="space-y-5">
      <div className="text-sm text-muted"><Link href={`/homes/${homeId}`} className="hover:underline">{home.name}</Link> · Mock inspection</div>
      <div><h1 className="text-2xl font-semibold tracking-tight">Mock inspection — {home.name}</h1><p className="text-sm text-muted">Judgements are computed from the records and the open compliance findings, the way an inspector would read them. The written report and action plan are drafted by AI on top; you decide what to do with them. Last 12 months, as at {fmtDate(now)}.</p></div>

      <div className={`card border ${TONE[scored.overall]}`}><div className="text-xs uppercase tracking-wide">Overall experiences and progress of children living in the home</div><div className="text-2xl font-semibold">{JUDGEMENT_LABEL[scored.overall]}</div></div>
      <div className="grid gap-3 md:grid-cols-3">{scored.areas.map((a) => <Area key={a.area} a={a} />)}</div>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">Written report and action plan</h2>{isConfigured() ? <ActionForm action={runMockInspection.bind(null, homeId)} submitLabel={latest ? "Run again" : "Write the report"} className="inline">{null}</ActionForm> : <span className="text-xs text-muted">AI drafting not configured</span>}</div>
        {!latest ? <p className="mt-2 text-sm text-muted">No report written yet. The judgements above stand on their own.</p> : (
          <div className="mt-3 space-y-4">
            <div className="text-xs text-muted">{fmtDate(latest.createdAt)} · {latest.model} · {latest.promptVersion} · requested by {ai.names[latest.createdBy ?? ""] ?? "—"} · <span className="pill">{latest.status}</span>{latest.decisionNote ? ` · ${latest.decisionNote}` : ""}</div>
            <div className="whitespace-pre-line rounded-md border border-line bg-bg p-4 text-sm">{latest.output}</div>
            {actions.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Proposed action plan · {actions.length}</h3>
                <table className="table"><thead><tr><th>#</th><th>Action</th><th>Owner</th><th>Due</th><th>Regulation</th></tr></thead><tbody>
                  {actions.map((a, i) => <tr key={i}><td>{i + 1}</td><td>{a.title}</td><td className="whitespace-nowrap">{a.owner.replace(/_/g, " ")}</td><td className="whitespace-nowrap">{a.dueDays} days</td><td>{a.regulation}</td></tr>)}
                </tbody></table>
                {latest.status === "draft" && canManage && <form action={createActionsFromDraft.bind(null, latest.id)} className="mt-3"><button className="btn" type="submit">Create these {actions.length} actions as tracked follow-ups</button><p className="mt-1 text-xs text-muted">Nothing is created until you press this. Owners and dates can be changed afterwards.</p></form>}
              </div>
            )}
          </div>
        )}
      </section>
      {latest && latest.status === "draft" && canManage && actions.length === 0 && <AiDraftPanel title="Decide on this report" drafts={[latest]} names={ai.names} request={runMockInspection.bind(null, homeId)} requestLabel="Write a new report" canRequest={false} canDecide={canManage} />}
      {ai.drafts.length > 1 && <AiDraftPanel title="Earlier reports" drafts={ai.drafts.slice(1)} names={ai.names} request={runMockInspection.bind(null, homeId)} requestLabel="Write a new report" canRequest={false} canDecide={false} />}
    </div>
  );
}

function Area({ a }: { a: AreaResult }) {
  return (
    <div className={`card border ${TONE[a.judgement]}`}>
      <div className="text-xs uppercase tracking-wide">{a.title}</div>
      <div className="text-xl font-semibold">{JUDGEMENT_LABEL[a.judgement]} <span className="text-sm font-normal">· {a.points}/100</span></div>
      {a.evidence.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-ok">{a.evidence.map((e) => <li key={e}>{e}</li>)}</ul>}
      {a.concerns.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-danger">{a.concerns.map((c) => <li key={c}>{c}</li>)}</ul>}
    </div>
  );
}
