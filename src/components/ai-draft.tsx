import { decideDraft } from "@/lib/ai/actions";
import { ActionForm } from "@/components/form";
import { fmtDateTime } from "@/components/record-status";
import type { AiDraft } from "@/db/schema";
import type { ActionState } from "@/lib/children/actions";

/**
 * Shows AI drafts for one target with accept / reject, and a button to
 * request a new one. Drafts are advisory: nothing here changes a record.
 */
export function AiDraftPanel({ title, drafts, names, request, requestLabel, canRequest, canDecide, accentAction }: {
  title: string; drafts: AiDraft[]; names: Record<string, string>;
  request: (p: ActionState, fd: FormData) => Promise<ActionState>; requestLabel: string; canRequest: boolean; canDecide: boolean;
  accentAction?: { label: string; action: (draftId: string) => Promise<void>; draftId: string } | null;
}) {
  const latest = drafts[0];
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title} <span className="font-normal text-muted">· AI draft</span></h2>
        {canRequest && <ActionForm action={request} submitLabel={requestLabel} className="inline">{null}</ActionForm>}
      </div>
      <p className="text-xs text-muted">Drafts are written from this home&apos;s own records only, and change nothing until a person accepts them. Every draft records the model, the prompt version and who decided.</p>
      {!latest ? <p className="text-sm text-muted">No draft yet.</p> : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className={`pill ${latest.status === "accepted" ? "text-ok" : latest.status === "rejected" ? "text-danger" : ""}`}>{latest.status}</span><span>{fmtDateTime(latest.createdAt)} · {latest.model} · {latest.promptVersion} · requested by {names[latest.createdBy ?? ""] ?? "—"}</span>{latest.decidedAt && <span>· {latest.status} by {names[latest.decidedBy ?? ""] ?? "—"} {fmtDateTime(latest.decidedAt)}{latest.decisionNote ? ` — ${latest.decisionNote}` : ""}</span>}</div>
          <div className="whitespace-pre-line rounded-md border border-line bg-bg p-3 text-sm">{latest.output}</div>
          {latest.status === "draft" && canDecide && (
            <div className="flex flex-wrap items-end gap-2">
              {accentAction && accentAction.draftId === latest.id && <form action={async () => { "use server"; await accentAction.action(latest.id); }}><button className="btn" type="submit">{accentAction.label}</button></form>}
              <form action={decideDraft.bind(null, latest.id)} className="flex flex-wrap items-end gap-2">
                <div><label className="label" htmlFor={`note-${latest.id}`}>Note</label><input id={`note-${latest.id}`} name="note" className="input py-1" placeholder="Optional" /></div>
                <button name="decision" value="accept" className="btn-ghost" type="submit">Accept as read</button>
                <button name="decision" value="reject" className="btn-ghost text-danger" type="submit">Reject</button>
              </form>
            </div>
          )}
          {drafts.length > 1 && <details className="text-xs text-muted"><summary className="cursor-pointer">{drafts.length - 1} earlier draft{drafts.length > 2 ? "s" : ""}</summary><ul className="mt-1 space-y-1">{drafts.slice(1).map((d) => <li key={d.id}>{fmtDateTime(d.createdAt)} · {d.status} · {d.model}</li>)}</ul></details>}
        </div>
      )}
    </section>
  );
}
