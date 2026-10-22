import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { listVisibleHomes, primaryOrganisation } from "@/lib/homes/queries";

export const metadata = { title: "Homes" };

export default async function HomesPage() {
  const user = await requireUser();
  const org = await primaryOrganisation(user);
  const list = org ? await listVisibleHomes(user, org.id) : [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Homes</h1>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>URN</th><th>Location</th><th>Capacity</th><th>Ages</th><th>Status</th></tr>
          </thead>
          <tbody>
            {list.map((h) => (
              <tr key={h.id}>
                <td><Link href={`/homes/${h.id}`} className="font-medium text-brand hover:underline">{h.name}</Link></td>
                <td>{h.ofstedUrn ?? "—"}</td>
                <td>{[h.town, h.postcode].filter(Boolean).join(", ")}</td>
                <td>{h.capacity ?? "—"}</td>
                <td>{h.ageRangeMin ?? "—"}–{h.ageRangeMax ?? "—"}</td>
                <td><span className="pill">{h.active ? "Active" : "Inactive"}</span></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="text-muted">No homes visible to your role.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
