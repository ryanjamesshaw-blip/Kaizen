import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getChildForUser, fullName } from "@/lib/children/queries";
import { childMedication } from "@/lib/operations/queries";
import { addMedication, recordMar } from "@/lib/operations/actions";
import { homeStaff } from "@/lib/staff/queries";
import { can } from "@/lib/rbac";
import { ActionForm, DateInput, Select, Text } from "@/components/form";
import { fmtDate, fmtDateTime } from "@/components/record-status";

const OUTCOME: Record<string, string> = { given: "Given", refused: "Refused", missed: "Missed", not_required: "Not required (PRN)", error: "ERROR", destroyed: "Destroyed / returned" };

export default async function MedicationPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const user = await requireUser();
  const child = await getChildForUser(user, childId);
  if (!child) notFound();
  const scope = { organisationId: child.organisationId, homeId: child.homeId };
  const canWrite = can(user.grants, "child:write", scope) && !child.archivedAt;
  const canPrescribeEntry = can(user.grants, "record:review", scope) && !child.archivedAt;
  const [{ meds, entries }, staff] = await Promise.all([childMedication(childId), homeStaff(child.homeId)]);
  const active = meds.filter((m) => !m.endOn || m.endOn >= new Date());
  const toLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

  return (
    <div className="space-y-5">
      <div className="text-sm text-muted"><Link href={`/children/${child.id}`} className="hover:underline">{fullName(child)}</Link> · Medication</div>
      <h1 className="text-2xl font-semibold tracking-tight">Medication — {fullName(child)} <span className="text-base font-normal text-muted">(Reg 23)</span></h1>
      {child.allergies && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger"><span className="font-medium">Allergies:</span> {child.allergies}</p>}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Current medication · {active.length}</h2>
        {active.length === 0 && <p className="text-sm text-muted">None.</p>}
        {active.map((m) => (
          <div key={m.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">{m.name} <span className="font-normal">{m.dose} · {m.route}</span>{m.controlledDrug && <span className="pill ml-2 border-red-200 text-red-800">Controlled drug</span>}{m.prn && <span className="pill ml-2">PRN</span>}{m.homely && <span className="pill ml-2">Homely remedy</span>}</div>
                <div className="text-sm text-muted">{m.frequency}{m.prnInstructions ? ` · ${m.prnInstructions}` : ""}{m.reason ? ` · for ${m.reason}` : ""}{m.prescribedBy ? ` · prescribed by ${m.prescribedBy}` : ""}</div>
                <div className="text-xs text-muted">From {fmtDate(m.startOn)}{m.endOn ? ` to ${fmtDate(m.endOn)}` : ""} · stock {m.stockCount ?? "—"}{m.consentRecordedOn ? ` · consent ${fmtDate(m.consentRecordedOn)}` : <span className="text-amber-700"> · no consent recorded</span>}</div>
              </div>
            </div>
            {canWrite && (
              <details className="mt-3 text-sm"><summary className="cursor-pointer text-brand">Record on MAR</summary>
                <div className="mt-2"><ActionForm action={recordMar.bind(null, m.id)} submitLabel="Record" successMessage="Recorded.">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Text name="administeredAt" label="Time" type="datetime-local" defaultValue={toLocal()} required />
                    <Select name="outcome" label="Outcome" options={Object.entries(OUTCOME)} />
                    <Text name="doseGiven" label="Dose given" defaultValue={m.dose} />
                    <Select name="witnessedBy" label={m.controlledDrug ? "Witness (required)" : "Witness"} options={[["", "—"], ...staff.filter((s) => s.id !== user.id).map((s): [string, string] => [s.id, s.fullName])]} />
                    <Text name="stockAfter" label="Stock after" type="number" defaultValue={m.stockCount !== null ? String(Math.max(0, m.stockCount - 1)) : ""} />
                  </div>
                  <Text name="notes" label="Notes (required for refused / error)" />
                </ActionForm></div>
              </details>
            )}
          </div>
        ))}
      </section>

      {canPrescribeEntry && (
        <details className="card"><summary className="cursor-pointer text-sm font-semibold">Add a medication</summary>
          <div className="mt-3"><ActionForm action={addMedication.bind(null, child.id)} submitLabel="Add" successMessage="Added.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Text name="name" label="Medication" required /><Text name="dose" label="Dose" required placeholder="10mg / 5ml" /><Select name="route" label="Route" options={[["oral", "Oral"], ["topical", "Topical"], ["inhaled", "Inhaled"], ["injection", "Injection"], ["other", "Other"]]} />
              <Text name="frequency" label="Times / frequency" required placeholder="08:00, 20:00 or as required" /><Text name="prescribedBy" label="Prescribed by" /><Text name="reason" label="For" />
              <DateInput name="startOn" label="Start" defaultValue={new Date()} required /><DateInput name="endOn" label="End (if course)" /><Text name="stockCount" label="Stock received" type="number" />
              <DateInput name="consentRecordedOn" label="Consent recorded (PR holder / LA)" />
            </div>
            <Text name="prnInstructions" label="PRN instructions (when, max in 24h, gap)" />
            <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" name="prn" />PRN / as required</label><label className="flex items-center gap-2"><input type="checkbox" name="controlledDrug" />Controlled drug</label><label className="flex items-center gap-2"><input type="checkbox" name="homely" />Homely remedy</label></div>
          </ActionForm></div>
        </details>
      )}

      <section className="card">
        <h2 className="mb-2 text-base font-semibold">MAR — recent entries</h2>
        {entries.length === 0 ? <p className="text-sm text-muted">Nothing recorded.</p> : (
          <table className="table">
            <thead><tr><th>When</th><th>Medication</th><th>Outcome</th><th>Dose</th><th>By</th><th>Witness</th><th>Stock</th><th>Notes</th></tr></thead>
            <tbody>
              {entries.map(({ e, byName }) => { const m = meds.find((x) => x.id === e.medicationId); return (
                <tr key={e.id} className={e.outcome === "error" ? "bg-red-50" : e.outcome === "refused" || e.outcome === "missed" ? "bg-amber-50" : ""}>
                  <td className="whitespace-nowrap">{fmtDateTime(e.administeredAt)}</td><td>{m?.name}</td><td className={e.outcome === "error" ? "font-medium text-danger" : ""}>{OUTCOME[e.outcome]}</td><td>{e.doseGiven ?? "—"}</td><td>{byName}</td><td>{e.witnessedBy ? staff.find((s) => s.id === e.witnessedBy)?.fullName ?? "✓" : "—"}</td><td>{e.stockAfter ?? "—"}</td><td className="text-muted">{e.notes}</td>
                </tr>); })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
