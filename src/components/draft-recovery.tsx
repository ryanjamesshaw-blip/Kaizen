"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps an in-progress form in localStorage so a dropped connection or a
 * closed tab on a night shift doesn't lose the entry. Cleared on submit.
 * Browser storage only: nothing here is a record until it is saved.
 */
export function DraftRecovery({ formKey }: { formKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const key = `kaizen:draft:${formKey}`;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const data = JSON.parse(saved) as Record<string, string>;
        let restored = 0;
        for (const [name, value] of Object.entries(data)) {
          const el = form.elements.namedItem(name);
          if (el instanceof RadioNodeList) { for (const r of Array.from(el)) if ((r as HTMLInputElement).value === value) (r as HTMLInputElement).checked = true; }
          else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) { if (!el.value) { el.value = value; restored++; } }
        }
        if (restored && ref.current) ref.current.textContent = "Unsaved draft restored from this device.";
      }
    } catch {}
    const save = () => {
      try {
        const data: Record<string, string> = {};
        for (const el of Array.from(form.elements)) {
          const i = el as HTMLInputElement;
          if (!i.name || i.type === "hidden" || i.type === "submit" || i.type === "file") continue;
          if ((i.type === "radio" || i.type === "checkbox") && !i.checked) continue;
          data[i.name] = i.value;
        }
        localStorage.setItem(key, JSON.stringify(data));
      } catch {}
    };
    const clear = () => { try { localStorage.removeItem(key); } catch {} };
    form.addEventListener("input", save);
    form.addEventListener("submit", clear);
    return () => { form.removeEventListener("input", save); form.removeEventListener("submit", clear); };
  }, [formKey]);
  return <div ref={ref} className="text-xs text-muted" aria-live="polite" />;
}
