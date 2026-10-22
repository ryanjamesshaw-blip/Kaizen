import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getChildForUser, fullName } from "@/lib/children/queries";
import { createDailyLog } from "@/lib/daily/actions";
import { currentShift, todayLondon } from "@/lib/daily/queries";
import { can } from "@/lib/rbac";
import { SaveOrSubmitForm } from "@/components/save-or-submit";
import { DailyLogFields } from "@/components/daily-log-fields";

export default async function NewLogPage({ params, searchParams }: { params: Promise<{ childId: string }>; searchParams: Promise<{ date?: string; shift?: string }> }) {
  const { childId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const child = await getChildForUser(user, childId);
  if (!child) notFound();
  if (!can(user.grants, "child:write", { organisationId: child.organisationId, homeId: child.homeId }) || child.archivedAt) return <p className="text-sm text-muted">Read-only for your role.</p>;
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayLondon();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="text-sm text-muted"><Link href={`/children/${child.id}`} className="hover:underline">{fullName(child)}</Link> · Daily log</div>
      <h1 className="text-2xl font-semibold tracking-tight">Log the shift — {fullName(child)}</h1>
      <div className="card">
        <SaveOrSubmitForm action={createDailyLog.bind(null, child.id)} draftKey={`log:${child.id}:${ymd}`}>
          <DailyLogFields date={new Date(`${ymd}T00:00:00Z`)} shift={sp.shift ?? currentShift()} />
        </SaveOrSubmitForm>
      </div>
    </div>
  );
}
