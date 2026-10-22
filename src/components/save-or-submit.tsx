"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/children/actions";
import { DraftRecovery } from "@/components/draft-recovery";

/** Form with two intents: save as draft, or submit for review. */
export function SaveOrSubmitForm({ action, draftKey, children, canSubmit = true }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; draftKey?: string; children: React.ReactNode; canSubmit?: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-4">
      {children}
      {draftKey && <DraftRecovery formKey={draftKey} />}
      {state.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="intent" value="draft" disabled={pending} className="btn-ghost">{pending ? "Saving…" : "Save draft"}</button>
        {canSubmit && <button type="submit" name="intent" value="submit" disabled={pending} className="btn">{pending ? "Saving…" : "Submit"}</button>}
      </div>
    </form>
  );
}
