"use client";

import { useState } from "react";
import type { ContactPerson } from "@/db/schema";

const ROLES = ["Mother", "Father", "Carer / guardian", "Sibling", "Other family", "Social worker", "IRO", "Placing authority contact", "GP", "Dentist", "Optician", "CAMHS / health", "School contact", "Advocate", "Solicitor", "Other"];

/** Edits Schedule 3 paras 9–13 contacts; serialises to a hidden JSON field. */
export function ContactsEditor({ initial }: { initial: ContactPerson[] }) {
  const [rows, setRows] = useState<ContactPerson[]>(initial);
  const update = (i: number, patch: Partial<ContactPerson>) => setRows((r) => r.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-3">
      <input type="hidden" name="contactsJson" value={JSON.stringify(rows)} />
      {rows.map((c, i) => (
        <div key={i} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-2">
          <div>
            <label className="label">Role</label>
            <select className="input" value={c.role} onChange={(e) => update(i, { role: e.target.value })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div><label className="label">Name</label><input className="input" value={c.name} onChange={(e) => update(i, { name: e.target.value })} required /></div>
          <div><label className="label">Organisation</label><input className="input" value={c.organisation ?? ""} onChange={(e) => update(i, { organisation: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" value={c.phone ?? ""} onChange={(e) => update(i, { phone: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" value={c.email ?? ""} onChange={(e) => update(i, { email: e.target.value })} /></div>
          <div><label className="label">Address</label><input className="input" value={c.address ?? ""} onChange={(e) => update(i, { address: e.target.value })} /></div>
          {/Mother|Father|Carer/.test(c.role) && (
            <>
              <div><label className="label">Religion (Sch 3 para 10)</label><input className="input" value={c.religion ?? ""} onChange={(e) => update(i, { religion: e.target.value })} /></div>
              <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={!!c.parentalResponsibility} onChange={(e) => update(i, { parentalResponsibility: e.target.checked })} />Has parental responsibility</label>
            </>
          )}
          <div className="sm:col-span-2"><label className="label">Notes</label><input className="input" value={c.notes ?? ""} onChange={(e) => update(i, { notes: e.target.value })} /></div>
          <div className="sm:col-span-2 text-right"><button type="button" className="btn-ghost" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>Remove</button></div>
        </div>
      ))}
      <button type="button" className="btn-ghost" onClick={() => setRows((r) => [...r, { role: "Social worker", name: "" }])}>+ Add person</button>
    </div>
  );
}
