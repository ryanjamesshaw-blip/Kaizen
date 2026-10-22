import { transitionRecord } from "@/lib/children/actions";
import { TRANSITION_LABELS, type Transition } from "@/lib/records/lifecycle";
import type { LifecycleTable } from "@/lib/records/transition";

/** Buttons for the lifecycle transitions the current user may apply. */
export function TransitionBar({ table, id, childId, transitions }: { table: LifecycleTable; id: string; childId: string; transitions: Transition[] }) {
  if (transitions.length === 0) return null;
  return (
    <div className="card space-y-3">
      <div className="text-sm font-semibold">Actions</div>
      <div className="flex flex-wrap gap-2">
        {transitions.filter((t) => t !== "amend" && t !== "return").map((t) => (
          <form key={t} action={transitionRecord.bind(null, table, id, childId, t)}>
            <button className="btn" type="submit">{TRANSITION_LABELS[t]}</button>
          </form>
        ))}
      </div>
      {transitions.includes("return") && (
        <form action={transitionRecord.bind(null, table, id, childId, "return")} className="flex flex-wrap items-end gap-2">
          <div className="flex-1"><label className="label" htmlFor="return-reason">Reason for returning</label><input id="return-reason" name="reason" className="input" required /></div>
          <button className="btn-ghost" type="submit">{TRANSITION_LABELS.return}</button>
        </form>
      )}
      {transitions.includes("amend") && (
        <form action={transitionRecord.bind(null, table, id, childId, "amend")} className="flex flex-wrap items-end gap-2">
          <div className="flex-1"><label className="label" htmlFor="amend-reason">Reason for amendment (required, recorded permanently)</label><input id="amend-reason" name="reason" className="input" required minLength={5} /></div>
          <button className="btn-ghost" type="submit">{TRANSITION_LABELS.amend}</button>
        </form>
      )}
    </div>
  );
}
