import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { getChildForUser, fullName } from "@/lib/children/queries";
import { getKeywork } from "@/lib/daily/queries";
import { updateKeywork } from "@/lib/daily/actions";
import { availableTransitions, canTransition } from "@/lib/records/lifecycle";
import { SaveOrSubmitForm } from "@/components/save-or-submit";
import { KeyworkFields } from "@/components/keywork-fields";
import { StatusPill, fmtDate, fmtDateTime } from "@/components/record-status";
import { TransitionBar } from "@/components/transition-bar";

export default async function KeyworkPage({ params }: { params: Promise<{ childId: string; sessionId: string }> }) {
  const { childId, sessionId } = await params;
  const user = await requireUser();
  const child = await getChildForUser(user, childId);
  if (!child) notFound();
  const k = await getKeywork(sessionId);
  if (!k || k.childId !== child.id) notFound();
  const ctx = { grants: user.grants, userId: user.id, organisationId: k.organisationId, homeId: k.homeId, record: { status: k.status, createdBy: k.createdBy } };
  const editable = canTransition("edit", ctx) && !child.archivedAt;
  const transitions = (child.archivedAt ? [] : availableTransitions(ctx)).filter((t) => t !== "submit");
  const names = Object.fromEntries((await db.select({ id: users.id, n: users.fullName }).from(users)).map((u) => [u.id, u.n]));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="text-sm text-muted"><Link href={`/children/${child.id}/daily`} className="hover:underline">{fullName(child)}</Link> · Key-work</div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Key-work · {fmtDate(k.sessionDate)}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm"><StatusPill status={k.status} version={k.version} /><span className="text-muted">{k.topics} · by {names[k.createdBy ?? ""] ?? "—"}</span></div>
      </div>
      {k.amendmentReason && <p className="rounded-md bg-bg px-3 py-2 text-sm"><span className="font-medium">Amended:</span> {k.amendmentReason}</p>}
      {editable ? (
        <div className="card"><SaveOrSubmitForm action={updateKeywork.bind(null, k.id)} draftKey={`keywork:${k.id}`}><KeyworkFields k={k} /></SaveOrSubmitForm></div>
      ) : (
        <div className="card space-y-3 text-sm">
          <div><div className="text-xs uppercase tracking-wide text-muted">Discussion</div><div className="whitespace-pre-line">{k.discussion}</div></div>
          {k.childsWords && <blockquote className="border-l-2 border-brand pl-3 italic">“{k.childsWords}”</blockquote>}
          <div><div className="text-xs uppercase tracking-wide text-muted">Actions agreed</div><div className="whitespace-pre-line">{k.actionsAgreed || "—"}</div></div>
          {k.nextSessionOn && <div className="text-muted">Next session {fmtDate(k.nextSessionOn)}</div>}
        </div>
      )}
      <TransitionBar table="keywork_session" id={k.id} childId={child.id} transitions={transitions} />
      <div className="card text-xs text-muted">
        <div>Created {fmtDateTime(k.createdAt)}</div>
        {k.submittedAt && <div>Submitted {fmtDateTime(k.submittedAt)}</div>}
        {k.reviewedAt && <div>Reviewed {fmtDateTime(k.reviewedAt)} by {names[k.reviewedBy ?? ""] ?? "—"}</div>}
        {k.lockedAt && <div>Locked {fmtDateTime(k.lockedAt)} by {names[k.lockedBy ?? ""] ?? "—"}</div>}
      </div>
    </div>
  );
}
