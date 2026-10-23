import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { followUpTasks, homes, reg44Visits, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { updateReg44, submitReg44, respondReg44 } from "@/lib/governance/actions";
import { can } from "@/lib/rbac";
import { availableTransitions } from "@/lib/records/lifecycle";
import { splitRecommendations } from "@/lib/rules/governance";
import { ActionForm, Area, DateInput, Text } from "@/components/form";
import { StatusPill, fmtDate, fmtDateTime } from "@/components/record-status";
import { TransitionBar } from "@/components/transition-bar";
import { TaskList } from "@/components/task-list";
import { nowMs } from "@/lib/time";

function Tri({ name, label, value }: { name: string; label: string; value: boolean | null }) {
  const v = value === true ? "yes" : value === false ? "no" : "";
  return <fieldset><legend className="label">{label}</legend><div className="flex gap-4 text-sm">{[["yes", "Yes"], ["no", "No"], ["", "Not formed"]].map(([val, l]) => <label key={val} className="flex items-center gap-1"><input type="radio" name={name} value={val} defaultChecked={v === val} />{l}</label>)}</div></fieldset>;
}

export default async function Reg44Page({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  const user = await requireUser();
  const [v] = await db.select().from(reg44Visits).where(eq(reg44Visits.id, visitId)).limit(1);
  if (!v) notFound();
  const scope = { organisationId: v.organisationId, homeId: v.homeId };
  if (!can(user.grants, "home:read", scope)) notFound();
  const [home] = await db.select().from(homes).where(eq(homes.id, v.homeId)).limit(1);
  const [tasks, names] = await Promise.all([
    db.select({ t: followUpTasks, ownerName: users.fullName }).from(followUpTasks).leftJoin(users, eq(users.id, followUpTasks.ownerUserId)).where(eq(followUpTasks.sourceId, v.id)).orderBy(followUpTasks.dueAt),
    db.select({ id: users.id, n: users.fullName }).from(users).then((r) => Object.fromEntries(r.map((u) => [u.id, u.n]))),
  ]);
  const isVisitor = v.visitorUserId === user.id && can(user.grants, "reg44:write", scope);
  const canManage = can(user.grants, "home:manage", scope);
  const editable = v.status === "draft" && (isVisitor || canManage);
  const transitions = canManage ? availableTransitions({ grants: user.grants, userId: user.id, organisationId: v.organisationId, homeId: v.homeId, record: { status: v.status, createdBy: v.createdBy } }).filter((t) => t !== "submit" && t !== "review") : [];
  const now = nowMs();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="text-sm text-muted"><Link href={`/governance?home=${v.homeId}`} className="hover:underline">Governance · {home?.name}</Link> · Reg 44 visit</div>
      <div><h1 className="text-2xl font-semibold tracking-tight">Independent person&apos;s visit — {fmtDate(v.visitedOn)}</h1><div className="mt-1 flex flex-wrap items-center gap-2 text-sm"><StatusPill status={v.status} version={v.version} /><span className="text-muted">{names[v.visitorUserId] ?? "—"}{v.announced ? " · announced" : " · unannounced"}</span>{v.safeguardingEffective === false && <span className="pill border-red-200 text-red-800">Children not effectively safeguarded</span>}{v.conductPromotesWellbeing === false && <span className="pill border-red-200 text-red-800">Conduct does not promote wellbeing</span>}</div></div>

      {editable ? (
        <div className="card">
          <ActionForm action={updateReg44.bind(null, v.id)} submitLabel="Save report" successMessage="Saved." className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3"><DateInput name="visitedOn" label="Date" defaultValue={v.visitedOn} required /><Text name="childrenPresent" label="Children present" type="number" defaultValue={v.childrenPresent?.toString()} /><Text name="childrenSpokenTo" label="Children spoken to" type="number" defaultValue={v.childrenSpokenTo?.toString()} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="announced" defaultChecked={v.announced} />Announced visit</label>
            <Text name="staffSpokenTo" label="Staff spoken to" defaultValue={v.staffSpokenTo} /><Text name="othersConsulted" label="Others consulted (social workers, parents, school, IRO)" defaultValue={v.othersConsulted} /><Area name="recordsReviewed" label="Records reviewed" defaultValue={v.recordsReviewed} rows={2} />
            <Area name="childrensViews" label="Children's views" defaultValue={v.childrensViews} rows={3} />
            <Area name="environment" label="Environment and atmosphere" defaultValue={v.environment} rows={2} />
            <div className="rounded-md border border-line p-3 space-y-3"><div className="font-medium">Regulation 44(4) opinions</div><Tri name="safeguardingEffective" label="Are children effectively safeguarded?" value={v.safeguardingEffective} /><Area name="safeguardingOpinion" label="Basis for that opinion" defaultValue={v.safeguardingOpinion} rows={3} /><Tri name="conductPromotesWellbeing" label="Does the conduct of the home promote children's wellbeing?" value={v.conductPromotesWellbeing} /><Area name="conductOpinion" label="Basis for that opinion" defaultValue={v.conductOpinion} rows={3} /></div>
            <Area name="followUpOnPrevious" label="Progress on previous recommendations" defaultValue={v.followUpOnPrevious} rows={2} />
            <Area name="recommendations" label="Recommendations — one per line; each becomes a tracked action for the manager when you submit" defaultValue={v.recommendations} rows={4} />
            <div className="grid gap-4 sm:grid-cols-2"><DateInput name="reportIssuedOn" label="Report issued" defaultValue={v.reportIssuedOn} /><DateInput name="ofstedCopyOn" label="Copy sent to Ofsted" defaultValue={v.ofstedCopyOn} /></div>
          </ActionForm>
          {(isVisitor || canManage) && <form action={submitReg44.bind(null, v.id)} className="mt-4 border-t border-line pt-4"><button className="btn" type="submit">Submit report to the registered manager</button><p className="mt-1 text-xs text-muted">Creates {splitRecommendations(v.recommendations).length} action{splitRecommendations(v.recommendations).length === 1 ? "" : "s"} plus the manager-response and Ofsted-copy tasks.</p></form>}
        </div>
      ) : (
        <div className="card space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-3"><B k="Children present / spoken to" v={`${v.childrenPresent ?? "—"} / ${v.childrenSpokenTo ?? "—"}`} /><B k="Staff spoken to" v={v.staffSpokenTo} /><B k="Others consulted" v={v.othersConsulted} /></div>
          <B k="Records reviewed" v={v.recordsReviewed} /><B k="Children's views" v={v.childrensViews} /><B k="Environment" v={v.environment} />
          <div className="rounded-md border border-line p-3 space-y-2"><div className="font-medium">Regulation 44(4) opinions</div><B k={`Children effectively safeguarded: ${v.safeguardingEffective === true ? "Yes" : v.safeguardingEffective === false ? "No" : "Not stated"}`} v={v.safeguardingOpinion} /><B k={`Conduct promotes wellbeing: ${v.conductPromotesWellbeing === true ? "Yes" : v.conductPromotesWellbeing === false ? "No" : "Not stated"}`} v={v.conductOpinion} /></div>
          <B k="Progress on previous recommendations" v={v.followUpOnPrevious} /><B k="Recommendations" v={v.recommendations} />
          <div className="grid gap-3 sm:grid-cols-2"><B k="Report issued" v={fmtDate(v.reportIssuedOn)} /><B k="Copy to Ofsted" v={v.ofstedCopyOn ? fmtDate(v.ofstedCopyOn) : null} /></div>
        </div>
      )}

      {v.status !== "draft" && (
        <section className="card text-sm">
          <h2 className="mb-2 text-base font-semibold">Registered manager&apos;s response <span className="font-normal text-muted">(Reg 44(6))</span></h2>
          {v.managerRespondedAt ? <div><div className="whitespace-pre-line">{v.managerResponse}</div><div className="mt-1 text-xs text-muted">{names[v.managerRespondedBy ?? ""]} · {fmtDateTime(v.managerRespondedAt)}</div></div>
            : canManage ? <ActionForm action={respondReg44.bind(null, v.id)} submitLabel="Record response" successMessage="Recorded."><Area name="managerResponse" label="Response to the findings and recommendations" rows={4} required />{!v.ofstedCopyOn && <DateInput name="ofstedCopyOn" label="Copy sent to Ofsted on" />}</ActionForm>
            : <p className="text-amber-700">Awaiting the manager&apos;s response.</p>}
        </section>
      )}

      {tasks.length > 0 && <section className="card"><h2 className="mb-2 text-base font-semibold">Actions from this visit</h2><TaskList rows={tasks} canAct={canManage} isSenior={canManage} isMine={() => canManage} now={now} /></section>}
      <TransitionBar table="reg44_visit" id={v.id} childId="" transitions={transitions} />
    </div>
  );
}
function B({ k, v }: { k: string; v: string | null }) { return <div><div className="text-xs uppercase tracking-wide text-muted">{k}</div><div className="whitespace-pre-line">{v || "—"}</div></div>; }
