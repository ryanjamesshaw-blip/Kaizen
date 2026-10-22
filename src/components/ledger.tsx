import { addMoneyEntry } from "@/lib/operations/actions";
import { balancePence, fmtPence } from "@/lib/rules/operations";
import { ActionForm, DateInput, Select, Text } from "@/components/form";
import { fmtDate } from "@/components/record-status";
import type { MoneyEntry } from "@/db/schema";

export function Ledger({ homeId, childId, rows, canWrite, staff, title, regulation }: { homeId: string; childId: string | null; rows: Array<{ e: MoneyEntry; byName: string | null }>; canWrite: boolean; staff: Array<{ id: string; fullName: string }>; title: string; regulation: string }) {
  const balance = balancePence(rows.map((r) => r.e));
  const noReceipt = rows.filter((r) => r.e.amountPence < 0 && !r.e.receiptHeld).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="text-sm text-muted">{regulation}{noReceipt ? <span className="text-amber-700"> · {noReceipt} payment{noReceipt > 1 ? "s" : ""} without a receipt</span> : null}</p></div>
        <div className="card py-3 text-right"><div className="text-xs uppercase text-muted">Balance</div><div className={`text-2xl font-semibold ${balance < 0 ? "text-danger" : ""}`}>{fmtPence(balance)}</div></div>
      </div>
      {canWrite && (
        <details className="card text-sm"><summary className="cursor-pointer font-semibold">Add an entry</summary>
          <div className="mt-3"><ActionForm action={addMoneyEntry.bind(null, homeId, childId)} submitLabel="Add" successMessage="Added.">
            <div className="grid gap-3 sm:grid-cols-4"><DateInput name="entryOn" label="Date" defaultValue={new Date()} required /><Select name="direction" label="In / out" options={[["out", "Paid out"], ["in", "Received"]]} /><Text name="amount" label="Amount £" required placeholder="12.50" /><Select name="witnessedBy" label="Witness" options={[["", "—"], ...staff.map((s): [string, string] => [s.id, s.fullName])]} /></div>
            <Text name="description" label="What for" required /><label className="flex items-center gap-2"><input type="checkbox" name="receiptHeld" defaultChecked />Receipt held</label>
          </ActionForm></div>
        </details>
      )}
      <div className="card">
        <table className="table">
          <thead><tr><th>Date</th><th>Description</th><th className="text-right">In</th><th className="text-right">Out</th><th>Receipt</th><th>By</th></tr></thead>
          <tbody>
            {rows.map(({ e, byName }) => (
              <tr key={e.id}><td className="whitespace-nowrap">{fmtDate(e.entryOn)}</td><td>{e.description}</td><td className="text-right text-ok">{e.amountPence > 0 ? fmtPence(e.amountPence) : ""}</td><td className="text-right">{e.amountPence < 0 ? fmtPence(-e.amountPence) : ""}</td><td>{e.amountPence < 0 ? (e.receiptHeld ? "✓" : <span className="text-amber-700">none</span>) : ""}</td><td className="text-muted">{byName}{e.witnessedBy ? " · witnessed" : ""}</td></tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-muted">No entries.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
