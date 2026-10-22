import type { RecordStatus } from "@/db/schema";
import { STATUS_LABELS } from "@/lib/records/lifecycle";

const TONE: Record<RecordStatus, string> = {
  draft: "bg-bg text-muted",
  submitted: "bg-amber-50 text-amber-800 border-amber-200",
  reviewed: "bg-blue-50 text-blue-800 border-blue-200",
  locked: "bg-green-50 text-green-800 border-green-200",
};

export function StatusPill({ status, version }: { status: RecordStatus; version?: number }) {
  return (
    <span className={`inline-block rounded-full border border-line px-2 py-0.5 text-xs ${TONE[status]}`}>
      {STATUS_LABELS[status]}{version && version > 1 ? ` · v${version}` : ""}
    </span>
  );
}

const LEVEL: Record<string, string> = {
  low: "bg-green-50 text-green-800 border-green-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  high: "bg-orange-50 text-orange-800 border-orange-200",
  very_high: "bg-red-50 text-red-800 border-red-200",
};
export const LEVEL_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High", very_high: "Very high" };

export function LevelPill({ level }: { level: string }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${LEVEL[level] ?? ""}`}>{LEVEL_LABEL[level] ?? level}</span>;
}

export function fmtDate(d: Date | null | undefined) {
  return d ? new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London" }) : "—";
}
export function fmtDateTime(d: Date | null | undefined) {
  return d ? new Date(d).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" }) : "—";
}
