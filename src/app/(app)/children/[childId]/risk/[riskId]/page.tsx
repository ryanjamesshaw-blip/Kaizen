import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { riskAssessments, users } from "@/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { getChildForUser, fullName } from "@/lib/children/queries";
import { updateRiskAssessment } from "@/lib/children/actions";
import { availableTransitions, canTransition, isOverdue } from "@/lib/records/lifecycle";
import { ActionForm } from "@/components/form";
import { RiskFields, RISK_TYPE_LABEL } from "@/components/risk-fields";
import { StatusPill, LevelPill, fmtDate, fmtDateTime } from "@/components/record-status";
import { TransitionBar } from "@/components/transition-bar";

export default async function RiskPage({ params }: { params: Promise<{ childId: string; riskId: string }> }) {
  const { childId, riskId } = await params;
  const user = await requireUser();
  const child = await getChildForUser(user, childId);
  if (!child) notFound();
  const [r] = await db.select().from(riskAssessments).where(eq(riskAssessments.id, riskId)).limit(1);
  if (!r || r.childId !== child.id) notFound();
  const ctx = { grants: user.grants, userId: user.id, organisationId: r.organisationId, homeId: r.homeId, record: { status: r.status, createdBy: r.createdBy } };
  const editable = canTransition("edit", ctx) && !child.archivedAt;
  const transitions = child.archivedAt ? [] : availableTransitions(ctx);
  const [superseded] = r.supersedesId ? await db.select({ id: riskAssessments.id, version: riskAssessments.version }).from(riskAssessments).where(eq(riskAssessments.id, r.supersedesId)).limit(1) : [];
  const [newer] = await db.select({ id: riskAssessments.id, version: riskAssessments.version }).from(riskAssessments).where(eq(riskAssessments.supersedesId, r.id)).limit(1);
  const names = Object.fromEntries((await db.select({ id: users.id, n: users.fullName }).from(users)).map((u) => [u.id, u.n]));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="text-sm text-muted"><Link href={`/children/${child.id}`} className="hover:underline">{fullName(child)}</Link> · Risk assessment</div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{r.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <StatusPill status={r.status} version={r.version} /><LevelPill level={r.level} /><span className="pill">{RISK_TYPE_LABEL[r.type]}</span>
            <span className={isOverdue(r.reviewDueOn) && r.status !== "locked" ? "text-danger" : "text-muted"}>Review due {fmtDate(r.reviewDueOn)}</span>
          </div>
        </div>
      </div>

      {newer && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">This version has been superseded by <Link className="underline" href={`/children/${child.id}/risk/${newer.id}`}>version {newer.version}</Link>. It is kept unchanged for the record.</p>}
      {r.amendmentReason && <p className="rounded-md bg-bg px-3 py-2 text-sm"><span className="font-medium">Amended from {superseded ? <Link className="underline" href={`/children/${child.id}/risk/${superseded.id}`}>version {superseded.version}</Link> : "previous version"}:</span> {r.amendmentReason}</p>}

      {editable ? (
        <div className="card">
          <ActionForm action={updateRiskAssessment.bind(null, r.id)} submitLabel="Save draft">
            <RiskFields r={r} />
          </ActionForm>
        </div>
      ) : (
        <div className="card space-y-4 text-sm">
          <Block k="Description" v={r.description} /><Block k="Triggers and early warning signs" v={r.triggers} /><Block k="Control measures" v={r.controls} /><Block k="Child's views" v={r.childsViews} />
        </div>
      )}

      <TransitionBar table="risk_assessment" id={r.id} childId={child.id} transitions={transitions} />

      <div className="card text-xs text-muted">
        <div>Created {fmtDateTime(r.createdAt)} by {names[r.createdBy ?? ""] ?? "—"}</div>
        {r.submittedAt && <div>Submitted {fmtDateTime(r.submittedAt)} by {names[r.submittedBy ?? ""] ?? "—"}</div>}
        {r.reviewedAt && <div>Reviewed {fmtDateTime(r.reviewedAt)} by {names[r.reviewedBy ?? ""] ?? "—"}</div>}
        {r.lockedAt && <div>Locked {fmtDateTime(r.lockedAt)} by {names[r.lockedBy ?? ""] ?? "—"}</div>}
      </div>
    </div>
  );
}

function Block({ k, v }: { k: string; v: string | null }) {
  return <div><div className="text-xs uppercase tracking-wide text-muted">{k}</div><div className="whitespace-pre-line">{v || "—"}</div></div>;
}
