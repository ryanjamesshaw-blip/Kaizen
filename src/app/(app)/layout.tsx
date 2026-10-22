import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { logout } from "@/lib/auth/actions";
import { ROLE_LABELS } from "@/lib/rbac";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/shift", label: "Shift" },
  { href: "/homes", label: "Homes" },
  { href: "/children", label: "Children" },
  { href: "/staff", label: "Staff & access" },
  { href: "/audit", label: "Audit log" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-semibold tracking-tight text-brand">Kaizen</Link>
            <nav className="hidden gap-4 text-sm md:flex">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-muted hover:text-ink">{n.label}</Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/account" className="text-right leading-tight hover:underline">
              <div className="font-medium">{user.fullName}</div>
              <div className="text-xs text-muted">{user.role ? ROLE_LABELS[user.role] : "No active role"}</div>
            </Link>
            <form action={logout}>
              <button className="btn-ghost" type="submit">Sign out</button>
            </form>
          </div>
        </div>
        <nav className="flex gap-4 overflow-x-auto border-t border-line px-4 py-2 text-sm md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap text-muted">{n.label}</Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-line px-4 py-3 text-center text-xs text-muted">
        Every view and change of a record is logged.
      </footer>
    </div>
  );
}
