"use client";

import { useActionState } from "react";
import { grantAccess } from "@/lib/staff/actions";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/db/schema";

type State = { error?: string; ok?: boolean; tempPassword?: string };

export function GrantForm({ organisationId, homes, roles }: { organisationId: string; homes: Array<{ id: string; name: string }>; roles: Role[] }) {
  const [state, action, pending] = useActionState<State, FormData>(grantAccess, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="organisationId" value={organisationId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="fullName">Full name</label><input id="fullName" name="fullName" className="input" required /></div>
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" required /></div>
        <div><label className="label" htmlFor="role">Role</label>
          <select id="role" name="role" className="input" defaultValue="care_worker">{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
        <div><label className="label" htmlFor="homeId">Home (home-scoped roles)</label>
          <select id="homeId" name="homeId" className="input" defaultValue={homes[0]?.id ?? ""}><option value="">— Organisation-wide —</option>{homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></div>
        <div><label className="label" htmlFor="validTo">Access ends (required for inspector / Reg 44)</label><input id="validTo" name="validTo" type="date" className="input" /></div>
      </div>
      {state.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state.ok && (
        <div role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-ok">
          Access granted.{state.tempPassword && <> New account created — temporary password: <code className="rounded bg-white px-1 font-mono">{state.tempPassword}</code>. Share it securely; it is shown once.</>}
        </div>
      )}
      <button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Grant access"}</button>
    </form>
  );
}
