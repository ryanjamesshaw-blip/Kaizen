"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/children/actions";

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  successMessage?: string;
  className?: string;
};

/** A form bound to a server action with the shared { error, ok } state. */
export function ActionForm({ action, children, submitLabel, successMessage, className }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} className={className ?? "space-y-4"}>
      {children}
      {state.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state.ok && successMessage && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-ok">{successMessage}</p>}
      <button type="submit" disabled={pending} className="btn">{pending ? "Saving…" : submitLabel}</button>
    </form>
  );
}

export function Field({ label, name, children, hint }: { label: string; name: string; children?: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Text({ name, label, defaultValue, required, type = "text", hint, placeholder }: { name: string; label: string; defaultValue?: string | null; required?: boolean; type?: string; hint?: string; placeholder?: string }) {
  return (
    <Field label={label} name={name} hint={hint}>
      <input id={name} name={name} type={type} defaultValue={defaultValue ?? ""} required={required} className="input" placeholder={placeholder} />
    </Field>
  );
}

export function Area({ name, label, defaultValue, rows = 3, hint, required }: { name: string; label: string; defaultValue?: string | null; rows?: number; hint?: string; required?: boolean }) {
  return (
    <Field label={label} name={name} hint={hint}>
      <textarea id={name} name={name} defaultValue={defaultValue ?? ""} rows={rows} required={required} className="input" />
    </Field>
  );
}

export function Select({ name, label, defaultValue, options, hint }: { name: string; label: string; defaultValue?: string | null; options: Array<[string, string]>; hint?: string }) {
  return (
    <Field label={label} name={name} hint={hint}>
      <select id={name} name={name} defaultValue={defaultValue ?? options[0]?.[0]} className="input">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Field>
  );
}

export function DateInput({ name, label, defaultValue, required, hint }: { name: string; label: string; defaultValue?: Date | null; required?: boolean; hint?: string }) {
  const v = defaultValue ? defaultValue.toISOString().slice(0, 10) : "";
  return (
    <Field label={label} name={name} hint={hint}>
      <input id={name} name={name} type="date" defaultValue={v} required={required} className="input" />
    </Field>
  );
}

export function Section({ title, children, description }: { title: string; children: React.ReactNode; description?: string }) {
  return (
    <fieldset className="card space-y-4">
      <legend className="px-1 text-base font-semibold">{title}</legend>
      {description && <p className="-mt-2 text-sm text-muted">{description}</p>}
      {children}
    </fieldset>
  );
}
