import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { getVisibleHome } from "@/lib/homes/queries";
import { homeDocumentsList } from "@/lib/operations/queries";
import { addHomeDocument } from "@/lib/operations/actions";
import { can } from "@/lib/rbac";
import { ActionForm, Area, DateInput, Select, Text } from "@/components/form";
import { fmtDate } from "@/components/record-status";
import { isOverdue } from "@/lib/records/lifecycle";

const KIND: Record<string, string> = { statement_of_purpose: "Statement of Purpose", childrens_guide: "Children's Guide", policy: "Policy", risk_assessment_home: "Home risk assessment", other: "Other" };

export default async function HomeDocumentsPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = await params;
  const user = await requireUser();
  const home = await getVisibleHome(user, homeId);
  if (!home) notFound();
  const canManage = can(user.grants, "home:manage", { organisationId: home.organisationId, homeId });
  const docs = await homeDocumentsList(homeId);
  const current = docs.filter((d) => d.current);
  const sop = current.find((d) => d.d.kind === "statement_of_purpose");
  const guide = current.find((d) => d.d.kind === "childrens_guide");
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted"><Link href={`/homes/${homeId}`} className="hover:underline">{home.name}</Link> · Statement of Purpose and policies</div>
      <h1 className="text-2xl font-semibold tracking-tight">Statement of Purpose, Children&apos;s Guide and policies</h1>
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <div className={`card ${sop ? "" : "border-red-200"}`}><div className="text-xs uppercase text-muted">Statement of Purpose (Reg 16)</div>{sop ? <div>v{sop.d.version} · from {fmtDate(sop.d.effectiveFrom)}{sop.d.ofstedNotifiedOn ? <span className="text-ok"> · Ofsted notified</span> : <span className="text-danger"> · Ofsted not notified of this version</span>}</div> : <div className="text-danger">None on file.</div>}</div>
        <div className={`card ${guide ? "" : "border-red-200"}`}><div className="text-xs uppercase text-muted">Children&apos;s Guide (Reg 16)</div>{guide ? <div>v{guide.d.version} · from {fmtDate(guide.d.effectiveFrom)}</div> : <div className="text-danger">None on file.</div>}</div>
      </div>
      {canManage && (
        <details className="card text-sm"><summary className="cursor-pointer font-semibold">Add a document or new version</summary>
          <div className="mt-3"><ActionForm action={addHomeDocument.bind(null, homeId)} submitLabel="Add" successMessage="Added.">
            <div className="grid gap-3 sm:grid-cols-3"><Select name="kind" label="Kind" options={Object.entries(KIND)} /><Text name="title" label="Title" required /><Text name="version" label="Version" required placeholder="3.1" /></div>
            <div className="grid gap-3 sm:grid-cols-3"><DateInput name="effectiveFrom" label="Effective from" defaultValue={new Date()} required /><DateInput name="reviewDueOn" label="Review due" /><DateInput name="ofstedNotifiedOn" label="Ofsted notified (SoP only)" /></div>
            <Select name="supersedesId" label="Replaces" options={[["", "— New document —"], ...current.map((d): [string, string] => [d.d.id, `${d.d.title} v${d.d.version}`])]} />
            <Area name="summaryOfChanges" label="Summary of changes" rows={2} /><div><label className="label" htmlFor="file">File (optional)</label><input id="file" name="file" type="file" className="input" /></div>
          </ActionForm></div>
        </details>
      )}
      <div className="card">
        <table className="table">
          <thead><tr><th>Kind</th><th>Title</th><th>Version</th><th>Effective</th><th>Review due</th><th>Changes</th><th></th></tr></thead>
          <tbody>
            {docs.map(({ d, current: cur }) => (
              <tr key={d.id} className={cur ? "" : "opacity-60"}>
                <td>{KIND[d.kind]}</td><td>{d.title}{!cur && <span className="pill ml-1">superseded</span>}</td><td>{d.version}</td><td>{fmtDate(d.effectiveFrom)}</td>
                <td className={cur && isOverdue(d.reviewDueOn) ? "text-danger" : ""}>{fmtDate(d.reviewDueOn)}</td><td className="text-muted">{d.summaryOfChanges}</td>
                <td>{d.fileName && <a href={`/home-documents/${d.id}`} className="text-brand hover:underline">Open</a>}</td>
              </tr>
            ))}
            {docs.length === 0 && <tr><td colSpan={7} className="text-muted">Nothing on file.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
