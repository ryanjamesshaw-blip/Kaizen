import Link from "next/link";
import type { HomeMetrics } from "@/lib/governance/metrics";
import { fmtDate } from "@/components/record-status";

/** Cross-home view for directors and the RI: one row per home, red where attention is needed. */
export function OrgDashboard({ metrics }: { metrics: HomeMetrics[] }) {
  const cols: Array<{ label: string; get: (m: HomeMetrics) => { v: string; bad: boolean }; href?: (m: HomeMetrics) => string }> = [
    { label: "Children", get: (m) => ({ v: `${m.children.placed}${m.children.capacity ? ` / ${m.children.capacity}` : ""}`, bad: false }), href: (m) => `/homes/${m.homeId}` },
    { label: "Incidents 30d", get: (m) => ({ v: `${m.incidents.total}${m.incidents.restraint ? ` · ${m.incidents.restraint} PI` : ""}${m.incidents.missing ? ` · ${m.incidents.missing} missing` : ""}`, bad: m.incidents.highOrCritical > 0 }), href: (m) => `/incidents?home=${m.homeId}` },
    { label: "Follow-ups", get: (m) => ({ v: m.followUps.overdue ? `${m.followUps.overdue} overdue` : `${m.followUps.open} open`, bad: m.followUps.overdue > 0 }), href: () => `/tasks` },
    { label: "Risk reviews", get: (m) => ({ v: m.risk.overdueReview ? `${m.risk.overdueReview} overdue` : "In date", bad: m.risk.overdueReview > 0 }), href: (m) => `/homes/${m.homeId}` },
    { label: "Daily logs", get: (m) => ({ v: m.recording.missingLogDays7 ? `${m.recording.missingLogDays7} gaps (7d)` : "Complete", bad: m.recording.missingLogDays7 > 0 }), href: (m) => `/shift?home=${m.homeId}` },
    { label: "Child's voice", get: (m) => ({ v: m.recording.voiceUnanswered ? `${m.recording.voiceUnanswered} unanswered` : "All answered", bad: m.recording.voiceUnanswered > 0 }) },
    { label: "Team", get: (m) => ({ v: `${m.staff.supervisionOverdue} sup. overdue · ${m.staff.schedule2Incomplete} files · ${m.staff.trainingExpired} expired`, bad: m.staff.supervisionOverdue + m.staff.schedule2Incomplete + m.staff.trainingExpired > 0 }), href: (m) => `/homes/${m.homeId}/team` },
    { label: "Checks", get: (m) => ({ v: m.checks.total === 0 ? "Not set up" : m.checks.overdue ? `${m.checks.overdue} overdue` : "In date", bad: m.checks.total === 0 || m.checks.overdue > 0 }), href: (m) => `/homes/${m.homeId}/checks` },
    { label: "Reg 44", get: (m) => ({ v: m.governance.reg44Status === "overdue" ? `Overdue (last ${fmtDate(m.governance.lastReg44 ? new Date(m.governance.lastReg44) : null)})` : `Due ${fmtDate(new Date(m.governance.reg44Due))}`, bad: m.governance.reg44Status === "overdue" }), href: (m) => `/governance?home=${m.homeId}` },
    { label: "Reg 45", get: (m) => ({ v: m.governance.reg45Status === "overdue" ? "Overdue" : `Due ${fmtDate(new Date(m.governance.reg45Due))}`, bad: m.governance.reg45Status === "overdue" }), href: (m) => `/governance?home=${m.homeId}` },
    { label: "SoP", get: (m) => ({ v: !m.governance.sopOnFile ? "Missing" : !m.governance.sopNotified ? "Not notified" : m.governance.policiesOverdue ? `${m.governance.policiesOverdue} policies overdue` : "OK", bad: !m.governance.sopOnFile || !m.governance.sopNotified || m.governance.policiesOverdue > 0 }), href: (m) => `/homes/${m.homeId}/documents` },
  ];
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead><tr><th>Home</th>{cols.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.homeId}>
              <td><Link href={`/homes/${m.homeId}`} className="font-medium text-brand hover:underline">{m.homeName}</Link></td>
              {cols.map((c) => { const { v, bad } = c.get(m); const inner = <span className={bad ? "font-medium text-danger" : ""}>{v}</span>; return <td key={c.label} className="whitespace-nowrap">{c.href ? <Link href={c.href(m)} className="hover:underline">{inner}</Link> : inner}</td>; })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
