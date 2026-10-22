import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { placementPlans, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { getChildForUser, fullName } from "@/lib/children/queries";
import { updatePlacementPlan } from "@/lib/children/actions";
import { availableTransitions, canTransition } from "@/lib/records/lifecycle";
import { ActionForm } from "@/components/form";
import { PlanFields, PLAN_SECTIONS } from "@/components/plan-fields";
import { StatusPill, fmtDate, fmtDateTime } from "@/components/record-status";
import { TransitionBar } from "@/components/transition-bar";

export default async function PlanPage({ params }: { params: Promise<{ childId: string; planId: string }> }) {
  const { childId, planId } = await params;
  const user = await requireUser();
  const child = await getChildForUser(user, childId);
  if (!child) notFound();
  const [p] = await db.select().from(placementPlans).where(eq(placementPlans.id, planId)).limit(1);
  if (!p || p.childId !== child.id) notFound();
  const ctx = { grants: user.grants, userId: user.id, organisationId: p.organisationId, homeId: p.homeId, record: { status: p.status, createdBy: p.createdBy } };
  const editable = canTransition("edit", ctx) && !child.archivedAt;
  const transitions = child.archivedAt ? [] : availableTransitions(ctx);
  const [superseded] = p.supersedesId ? await db.select({ id: placementPlans.id, version: placementPlans.version }).from(placementPlans).where(eq(placementPlans.id, p.supersedesId)).limit(1) : [];
  const [newer] = await db.select({ id: placementPlans.id, version: placementPlans.version }).from(placementPlans).where(eq(placementPlans.supersedesId, p.id)).limit(1);
  const names = Object.fromEntries((await db.select({ id: users.id, n: users.fullName }).from(users)).map((u) => [u.id, u.n]));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="text-sm text-muted"><Link href={`/children/${child.id}`} className="hover:underline">{fullName(child)}</Link> · Placement plan</div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Placement plan</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm"><StatusPill status={p.status} version={p.version} /><span className="text-muted">Review due {fmtDate(p.reviewDueOn)}</span></div>
      </div>

      {newer && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">Superseded by <Link className="underline" href={`/children/${child.id}/plan/${newer.id}`}>version {newer.version}</Link>. Kept unchanged for the record.</p>}
      {p.amendmentReason && <p className="rounded-md bg-bg px-3 py-2 text-sm"><span className="font-medium">Amended from {superseded ? <Link className="underline" href={`/children/${child.id}/plan/${superseded.id}`}>version {superseded.version}</Link> : "previous version"}:</span> {p.amendmentReason}</p>}

      {editable ? (
        <div className="card"><ActionForm action={updatePlacementPlan.bind(null, p.id)} submitLabel="Save draft"><PlanFields p={p} /></ActionForm></div>
      ) : (
        <div className="card space-y-4 text-sm">
          {PLAN_SECTIONS.map(([k, label]) => <div key={k}><div className="text-xs uppercase tracking-wide text-muted">{label}</div><div className="whitespace-pre-line">{(p[k] as string | null) || "—"}</div></div>)}
        </div>
      )}

      <TransitionBar table="placement_plan" id={p.id} childId={child.id} transitions={transitions} />

      <div className="card text-xs text-muted">
        <div>Created {fmtDateTime(p.createdAt)} by {names[p.createdBy ?? ""] ?? "—"}</div>
        {p.submittedAt && <div>Submitted {fmtDateTime(p.submittedAt)} by {names[p.submittedBy ?? ""] ?? "—"}</div>}
        {p.reviewedAt && <div>Reviewed {fmtDateTime(p.reviewedAt)} by {names[p.reviewedBy ?? ""] ?? "—"}</div>}
        {p.lockedAt && <div>Locked {fmtDateTime(p.lockedAt)} by {names[p.lockedBy ?? ""] ?? "—"}</div>}
      </div>
    </div>
  );
}
