import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { getChildForUser, fullName } from "@/lib/children/queries";
import { getDailyLog } from "@/lib/daily/queries";
import { updateDailyLog } from "@/lib/daily/actions";
import { availableTransitions, canTransition } from "@/lib/records/lifecycle";
import { SaveOrSubmitForm } from "@/components/save-or-submit";
import { DailyLogFields, SHIFT_LABEL, MOOD_LABEL } from "@/components/daily-log-fields";
import { StatusPill, fmtDate, fmtDateTime } from "@/components/record-status";
import { TransitionBar } from "@/components/transition-bar";

export default async function LogPage({ params }: { params: Promise<{ logId: string }> }) {
  const { logId } = await params;
  const user = await requireUser();
  const l = await getDailyLog(logId);
  if (!l) notFound();
  const child = await getChildForUser(user, l.childId);
  if (!child) notFound();
  const ctx = { grants: user.grants, userId: user.id, organisationId: l.organisationId, homeId: l.homeId, record: { status: l.status, createdBy: l.createdBy } };
  const editable = canTransition("edit", ctx) && !child.archivedAt;
  const transitions = (child.archivedAt ? [] : availableTransitions(ctx)).filter((t) => t !== "submit"); // submit is on the form
  const names = Object.fromEntries((await db.select({ id: users.id, n: users.fullName }).from(users)).map((u) => [u.id, u.n]));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="text-sm text-muted"><Link href={`/shift?home=${l.homeId}&date=${l.logDate.toISOString().slice(0, 10)}`} className="hover:underline">Shift</Link> · <Link href={`/children/${child.id}/daily`} className="hover:underline">{fullName(child)}</Link></div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{fullName(child)} · {fmtDate(l.logDate)} · {SHIFT_LABEL[l.shift]}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm"><StatusPill status={l.status} version={l.version} /><span className="pill">{MOOD_LABEL[l.mood]}</span><span className="text-muted">by {names[l.createdBy ?? ""] ?? "—"}</span></div>
      </div>
      {l.amendmentReason && <p className="rounded-md bg-bg px-3 py-2 text-sm"><span className="font-medium">Amended:</span> {l.amendmentReason}</p>}

      {editable ? (
        <div className="card"><SaveOrSubmitForm action={updateDailyLog.bind(null, l.id)} draftKey={`log:${l.id}`}><DailyLogFields l={l} /></SaveOrSubmitForm></div>
      ) : (
        <div className="card space-y-3 text-sm">
          <Block k="How the shift went" v={l.narrative} />
          <div className="grid gap-3 sm:grid-cols-2"><Block k="Positives" v={l.positives} /><Block k="Concerns" v={l.concerns} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Block k="Education" v={[l.attendedEducation === true ? "Attended" : l.attendedEducation === false ? "Did not attend" : null, l.educationNotes].filter(Boolean).join(" — ")} />
            <Block k="Meals" v={l.meals} /><Block k="Activities" v={l.activities} /><Block k="Contact" v={l.contactWithFamily} />
            <Block k="Health" v={[l.medicationGiven === true ? "Medication given" : l.medicationGiven === false ? "Medication not given" : null, l.healthNotes].filter(Boolean).join(" — ")} />
            <Block k="Bedtime / sleep" v={[l.bedtime, l.sleep].filter(Boolean).join(" · ")} />
          </div>
        </div>
      )}

      <TransitionBar table="daily_log" id={l.id} childId={child.id} transitions={transitions} />
      <div className="card text-xs text-muted">
        <div>Created {fmtDateTime(l.createdAt)}</div>
        {l.submittedAt && <div>Submitted {fmtDateTime(l.submittedAt)} by {names[l.submittedBy ?? ""] ?? "—"}</div>}
        {l.reviewedAt && <div>Reviewed {fmtDateTime(l.reviewedAt)} by {names[l.reviewedBy ?? ""] ?? "—"}</div>}
        {l.lockedAt && <div>Locked {fmtDateTime(l.lockedAt)} by {names[l.lockedBy ?? ""] ?? "—"}</div>}
      </div>
    </div>
  );
}
function Block({ k, v }: { k: string; v: string | null }) {
  return <div><div className="text-xs uppercase tracking-wide text-muted">{k}</div><div className="whitespace-pre-line">{v || "—"}</div></div>;
}
