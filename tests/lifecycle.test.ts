import { describe, it, expect } from "vitest";
import { canTransition, availableTransitions, isOverdue, type LifecycleContext } from "@/lib/records/lifecycle";
import type { Grant } from "@/lib/rbac";
import type { RecordStatus } from "@/db/schema";

const ORG = "org";
const HOME = "oak";
const g = (role: Grant["role"]): Grant => ({
  role,
  organisationId: ORG,
  homeId: role === "director" ? null : HOME,
  validFrom: new Date("2026-01-01"),
  validTo: null,
  revokedAt: null,
});
const ctx = (role: Grant["role"], status: RecordStatus, createdBy = "me", userId = "me"): LifecycleContext => ({
  grants: [g(role)],
  userId,
  organisationId: ORG,
  homeId: HOME,
  record: { status, createdBy },
});

describe("care worker", () => {
  it("can edit and submit their own draft", () => {
    expect(canTransition("edit", ctx("care_worker", "draft"))).toBe(true);
    expect(canTransition("submit", ctx("care_worker", "draft"))).toBe(true);
  });
  it("cannot touch a colleague's draft", () => {
    expect(canTransition("edit", ctx("care_worker", "draft", "someone-else"))).toBe(false);
    expect(canTransition("submit", ctx("care_worker", "draft", "someone-else"))).toBe(false);
  });
  it("cannot review, lock or amend", () => {
    expect(availableTransitions(ctx("care_worker", "submitted"))).toEqual([]);
    expect(availableTransitions(ctx("care_worker", "locked"))).toEqual([]);
  });
  it("cannot edit once submitted", () => {
    expect(canTransition("edit", ctx("care_worker", "submitted"))).toBe(false);
  });
});

describe("deputy", () => {
  it("can review or return a submitted record but not lock it", () => {
    expect(availableTransitions(ctx("deputy", "submitted")).sort()).toEqual(["return", "review", "submit"].filter((t) => t !== "submit").sort());
    expect(canTransition("lock", ctx("deputy", "reviewed"))).toBe(false);
  });
  it("can edit any draft in their home", () => {
    expect(canTransition("edit", ctx("deputy", "draft", "someone-else"))).toBe(true);
  });
});

describe("registered manager", () => {
  it("can lock a reviewed record and amend a locked one", () => {
    expect(canTransition("lock", ctx("registered_manager", "reviewed"))).toBe(true);
    expect(canTransition("amend", ctx("registered_manager", "locked"))).toBe(true);
  });
  it("cannot edit a locked record in place", () => {
    expect(canTransition("edit", ctx("registered_manager", "locked"))).toBe(false);
  });
});

describe("inspector", () => {
  it("has no transitions at all", () => {
    for (const s of ["draft", "submitted", "reviewed", "locked"] as RecordStatus[]) {
      expect(availableTransitions(ctx("inspector", s))).toEqual([]);
      expect(canTransition("edit", ctx("inspector", s))).toBe(false);
    }
  });
});

describe("isOverdue", () => {
  it("is not overdue on the due day, overdue the day after", () => {
    const due = new Date("2026-10-22");
    expect(isOverdue(due, new Date("2026-10-22T15:00:00"))).toBe(false);
    expect(isOverdue(due, new Date("2026-10-23T00:00:01"))).toBe(true);
  });
});
