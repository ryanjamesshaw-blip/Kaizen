import { describe, it, expect } from "vitest";
import { can, visibleHomes, isGrantActive, primaryRole, type Grant } from "@/lib/rbac";

const ORG = "org-1";
const OAK = "home-oak";
const WILLOW = "home-willow";
const past = new Date("2026-01-01");
const future = new Date("2099-01-01");

const grant = (p: Partial<Grant>): Grant => ({
  role: "care_worker",
  organisationId: ORG,
  homeId: OAK,
  validFrom: past,
  validTo: null,
  revokedAt: null,
  ...p,
});

describe("scope", () => {
  it("director sees every home in the organisation", () => {
    const g = [grant({ role: "director", homeId: null })];
    expect(visibleHomes(g, ORG)).toBe("all");
    expect(can(g, "child:read", { organisationId: ORG, homeId: WILLOW })).toBe(true);
  });

  it("care worker sees only their own home", () => {
    const g = [grant({ role: "care_worker", homeId: OAK })];
    expect(visibleHomes(g, ORG)).toEqual([OAK]);
    expect(can(g, "child:read", { organisationId: ORG, homeId: OAK })).toBe(true);
    expect(can(g, "child:read", { organisationId: ORG, homeId: WILLOW })).toBe(false);
  });

  it("a grant in another organisation gives nothing here", () => {
    const g = [grant({ role: "director", homeId: null, organisationId: "org-2" })];
    expect(visibleHomes(g, ORG)).toEqual([]);
    expect(can(g, "org:read", { organisationId: ORG })).toBe(false);
  });
});

describe("permissions", () => {
  it("care worker cannot review or lock records", () => {
    const g = [grant({ role: "care_worker" })];
    expect(can(g, "record:submit", { organisationId: ORG, homeId: OAK })).toBe(true);
    expect(can(g, "record:review", { organisationId: ORG, homeId: OAK })).toBe(false);
    expect(can(g, "record:lock", { organisationId: ORG, homeId: OAK })).toBe(false);
  });

  it("inspector is read-only", () => {
    const g = [grant({ role: "inspector" })];
    expect(can(g, "child:read", { organisationId: ORG, homeId: OAK })).toBe(true);
    expect(can(g, "child:write", { organisationId: ORG, homeId: OAK })).toBe(false);
    expect(can(g, "inspection:export", { organisationId: ORG, homeId: OAK })).toBe(true);
  });

  it("system admin has no child data access", () => {
    const g = [grant({ role: "system_admin", homeId: null })];
    expect(can(g, "staff:manage", { organisationId: ORG })).toBe(true);
    expect(can(g, "child:read", { organisationId: ORG, homeId: OAK })).toBe(false);
  });

  it("only RM and above can grant access", () => {
    expect(can([grant({ role: "registered_manager" })], "access:grant", { organisationId: ORG, homeId: OAK })).toBe(true);
    expect(can([grant({ role: "deputy" })], "access:grant", { organisationId: ORG, homeId: OAK })).toBe(false);
  });
});

describe("time-boxed grants", () => {
  it("expires at validTo", () => {
    const g = grant({ role: "inspector", validTo: new Date("2026-06-01") });
    expect(isGrantActive(g, new Date("2026-05-31"))).toBe(true);
    expect(isGrantActive(g, new Date("2026-06-01"))).toBe(false);
  });

  it("is inactive before validFrom and after revocation", () => {
    expect(isGrantActive(grant({ validFrom: future }))).toBe(false);
    expect(isGrantActive(grant({ revokedAt: past }))).toBe(false);
  });

  it("an expired inspector grant gives no access", () => {
    const g = [grant({ role: "inspector", validTo: past })];
    expect(can(g, "child:read", { organisationId: ORG, homeId: OAK })).toBe(false);
  });
});

describe("primaryRole", () => {
  it("picks the highest active role", () => {
    const g = [grant({ role: "care_worker" }), grant({ role: "registered_manager", revokedAt: past }), grant({ role: "deputy" })];
    expect(primaryRole(g)).toBe("deputy");
  });
});
