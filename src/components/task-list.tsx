import Link from "next/link";
import { completeTask } from "@/lib/incidents/actions";
import { ROLE_LABELS } from "@/lib/rbac";
import { fmtDateTime } from "@/components/record-status";
import type { FollowUpTask } from "@/db/schema";

export type TaskRow = { t: FollowUpTask; ownerName?: string | null; childName?: string | null; incidentType?: string | null };

export function TaskList({ rows, canAct, showChild = false, isSenior = false, isMine, now }: { rows: TaskRow[]; canAct: boolean; showChild?: boolean; isSenior?: boolean; isMine?: (t: FollowUpTask) => boolean; now: number }) {
  if (rows.length === 0) return <p className="text-sm text-muted">No tasks.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map(({ t, ownerName, childName }) => {
        const open = t.status === "open";
        const overdue = open && t.dueAt.getTime() < now;
        const mine = isMine?.(t) ?? false;
        return (
          <li key={t.id} className={`py-3 text-sm ${open ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-medium ${overdue ? "text-danger" : ""}`}>{t.title}</span>
                  {mine && open && <span className="pill border-brand text-brand">yours</span>}
                  {!open && <span className="pill">{t.status === "done" ? "Done" : "Not applicable"}</span>}
                </div>
                {t.detail && <div className="text-muted">{t.detail}</div>}
                <div className="mt-0.5 text-xs text-muted">
                  {showChild && childName && <><Link href={`/children/${t.childId}`} className="hover:underline">{childName}</Link> · </>}
                  {t.incidentId && <><Link href={`/incidents/${t.incidentId}`} className="hover:underline">incident</Link> · </>}
                  {t.ownerRole ? ROLE_LABELS[t.ownerRole] : ownerName ?? "Unassigned"} · due {fmtDateTime(t.dueAt)}{overdue ? " · OVERDUE" : ""} · {t.regulation}
                  {!open && t.completionNote && <> · {t.completionNote}</>}
                </div>
              </div>
              {open && canAct && (mine || isSenior) && (
                <form action={completeTask.bind(null, t.id)} className="flex items-center gap-1">
                  <input name="note" placeholder="Note / evidence" className="input w-40 py-1 text-xs" aria-label="Completion note" />
                  <button name="intent" value="done" className="btn py-1 text-xs" type="submit">Done</button>
                  {isSenior && <button name="intent" value="na" className="btn-ghost py-1 text-xs" type="submit" title="Requires a note">N/A</button>}
                </form>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
