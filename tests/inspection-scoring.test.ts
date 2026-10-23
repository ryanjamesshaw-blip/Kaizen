import { describe, it, expect } from "vitest";
import { scoreInspection } from "@/lib/rules/inspection";
import type { HomeMetrics } from "@/lib/governance/metrics";

const clean = (): HomeMetrics => ({
  homeId: "h", homeName: "Test", period: { from: new Date("2026-01-01"), to: new Date("2026-10-23") }, score: 100,
  children: { placed: 3, admitted: 1, discharged: 0, capacity: 4 },
  incidents: { total: 2, restraint: 1, missing: 1, safeguarding: 0, complaints: 0, allegations: 0, medicationErrors: 0, highOrCritical: 1 },
  followUps: { open: 1, overdue: 0, completedInPeriod: 12 },
  risk: { current: 4, overdueReview: 0 },
  recording: { logsInPeriod: 200, missingLogDays7: 0, awaitingReview: 0, keyworkInPeriod: 10, voiceUnanswered: 0 },
  medication: { refusedOrMissed: 1, errors: 0 },
  staff: { careStaff: 6, supervisionOverdue: 0, schedule2Incomplete: 0, trainingExpired: 0, level3Overdue: 0 },
  checks: { total: 14, overdue: 0, failedLast: 0 },
  governance: { lastReg44: new Date("2026-10-01"), reg44Due: new Date("2026-11-01"), reg44Status: "ok", reg44InPeriod: 9, lastReg45To: new Date("2026-06-30"), reg45Due: new Date("2026-12-30"), reg45Status: "ok", sopOnFile: true, sopNotified: true, policiesOverdue: 0 },
});

describe("mock inspection scoring", () => {
  it("a clean home is outstanding everywhere", () => {
    const r = scoreInspection(clean(), {});
    expect(r.areas.map((a) => a.judgement)).toEqual(["outstanding", "outstanding", "outstanding"]);
    expect(r.overall).toBe("outstanding");
    expect(r.areas[1].evidence).toContain("All risk assessments reviewed on time");
  });
  it("overdue risk reviews and missing notifications pull protection down", () => {
    const m = clean(); m.risk.overdueReview = 2;
    const r = scoreInspection(m, { "notification.unsent": 1 });
    const prot = r.areas.find((a) => a.area === "protection")!;
    expect(prot.points).toBe(100 - 16 - 25);
    expect(prot.judgement).toBe("requires_improvement");
    expect(prot.concerns.some((c) => c.includes("Reg 40"))).toBe(true);
  });
  it("two unsent notifications is a hard fail", () => {
    expect(scoreInspection(clean(), { "notification.unsent": 2 }).overall).toBe("inadequate");
  });
  it("no Statement of Purpose makes leadership inadequate and caps overall", () => {
    const m = clean(); m.governance.sopOnFile = false;
    const r = scoreInspection(m, {});
    expect(r.areas.find((a) => a.area === "leadership")!.judgement).toBe("inadequate");
    expect(r.overall).toBe("inadequate");
  });
  it("overall is the weakest area", () => {
    const m = clean(); m.staff.supervisionOverdue = 3; m.governance.reg44Status = "overdue";
    const r = scoreInspection(m, {});
    expect(r.areas.find((a) => a.area === "leadership")!.judgement).toBe("requires_improvement");
    expect(r.overall).toBe("requires_improvement");
  });
});
