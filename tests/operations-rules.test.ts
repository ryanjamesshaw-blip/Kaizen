import { describe, it, expect } from "vitest";
import { supervisionDueOn, supervisionStatus, schedule2Missing, level3Status, dbsStatus, trainingStatus, checkDueOn, checkStatus, balancePence, fmtPence } from "@/lib/rules/operations";

const d = (s: string) => new Date(s);
const now = d("2026-10-22T20:00:00Z");

describe("supervision", () => {
  it("is monthly during probation and six-weekly after", () => {
    expect(supervisionDueOn(d("2026-10-01"), d("2026-09-01"), d("2027-03-01"), now).toISOString().slice(0, 10)).toBe("2026-10-29");
    expect(supervisionDueOn(d("2026-10-01"), d("2024-09-01"), d("2025-03-01"), now).toISOString().slice(0, 10)).toBe("2026-11-12");
  });
  it("counts from the start date when none has been held", () => {
    expect(supervisionDueOn(null, d("2026-10-01"), d("2027-04-01"), now).toISOString().slice(0, 10)).toBe("2026-10-29");
  });
  it("reports status", () => {
    expect(supervisionStatus(d("2026-10-01"), d("2026-11-12"), now)).toBe("ok");
    expect(supervisionStatus(d("2026-10-01"), d("2026-10-25"), now)).toBe("due_soon");
    expect(supervisionStatus(d("2026-08-01"), d("2026-09-12"), now)).toBe("overdue");
    expect(supervisionStatus(null, d("2026-11-01"), now)).toBe("never");
  });
});

describe("schedule 2", () => {
  it("lists everything missing on an empty record", () => {
    expect(schedule2Missing(null).length).toBe(10);
  });
  it("treats false and null as missing, dates and true as present", () => {
    const missing = schedule2Missing({ idVerifiedOn: d("2026-01-01"), photoOnFile: true, dbsIssuedOn: null, reference1ReceivedOn: d("2026-01-01") });
    expect(missing).not.toContain("Proof of identity");
    expect(missing).not.toContain("Recent photograph");
    expect(missing).toContain("Enhanced DBS with barred list check");
  });
});

describe("qualifications and DBS", () => {
  it("level 3 within two years of start", () => {
    expect(level3Status({ startDate: d("2025-06-01"), level3AchievedOn: null }, now)).toBe("within_window");
    expect(level3Status({ startDate: d("2024-01-01"), level3AchievedOn: null }, now)).toBe("overdue");
    expect(level3Status({ startDate: d("2024-01-01"), level3AchievedOn: d("2025-06-01") }, now)).toBe("achieved");
  });
  it("DBS renew after 3 years unless on update service", () => {
    expect(dbsStatus(d("2022-01-01"), false, now)).toBe("renew");
    expect(dbsStatus(d("2022-01-01"), true, now)).toBe("ok");
    expect(dbsStatus(null, false, now)).toBe("missing");
  });
});

describe("training and checks", () => {
  it("training status", () => {
    expect(trainingStatus(d("2026-11-15"), now)).toBe("expiring");
    expect(trainingStatus(d("2026-10-01"), now)).toBe("expired");
    expect(trainingStatus(d("2027-10-01"), now)).toBe("valid");
    expect(trainingStatus(null, now)).toBe("no_expiry");
  });
  it("check due dates and status", () => {
    const due = checkDueOn(d("2026-10-10"), 7, d("2026-01-01"));
    expect(due.toISOString().slice(0, 10)).toBe("2026-10-17");
    expect(checkStatus(due, now)).toBe("overdue");
    expect(checkStatus(d("2026-10-24"), now)).toBe("due_soon");
    expect(checkStatus(d("2026-11-24"), now)).toBe("ok");
  });
});

describe("money", () => {
  it("sums and formats pence", () => {
    expect(balancePence([{ amountPence: 10000 }, { amountPence: -1250 }])).toBe(8750);
    expect(fmtPence(8750)).toBe("£87.50");
    expect(fmtPence(-5)).toBe("-£0.05");
  });
});
