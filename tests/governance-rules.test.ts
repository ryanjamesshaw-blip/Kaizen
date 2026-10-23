import { describe, it, expect } from "vitest";
import { reg44DueOn, reg45DueOn, cadenceStatus, splitRecommendations, QUALITY_STANDARDS } from "@/lib/rules/governance";

const d = (s: string) => new Date(s);
describe("cadence", () => {
  it("Reg 44 monthly, Reg 45 six-monthly", () => {
    expect(reg44DueOn(d("2026-10-01"), d("2026-01-01")).toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(reg45DueOn(d("2026-03-31"), d("2026-01-01")).toISOString().slice(0, 10)).toBe("2026-09-30");
    expect(reg44DueOn(null, d("2026-10-01")).toISOString().slice(0, 10)).toBe("2026-11-01");
  });
  it("status", () => {
    const now = d("2026-10-23");
    expect(cadenceStatus(d("2026-11-20"), now)).toBe("ok");
    expect(cadenceStatus(d("2026-10-27"), now)).toBe("due_soon");
    expect(cadenceStatus(d("2026-10-20"), now)).toBe("overdue");
  });
});
describe("recommendations", () => {
  it("splits bullets and numbers", () => {
    expect(splitRecommendations("1. Fix the fence\n- Update missing plan\n\n• Train staff")).toEqual(["Fix the fence", "Update missing plan", "Train staff"]);
    expect(splitRecommendations(null)).toEqual([]);
  });
  it("covers regs 6 to 14", () => {
    expect(QUALITY_STANDARDS.map((q) => q.regulation)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });
});
