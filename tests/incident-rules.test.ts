import { describe, it, expect } from "vitest";
import { tasksFor, defaultNotifications, dueDate, INCIDENT_RULES, type IncidentFacts } from "@/lib/rules/incidents";

const base = (over: Partial<IncidentFacts> = {}): IncidentFacts => ({
  type: "incident",
  severity: "medium",
  occurredAt: new Date("2026-10-22T19:00:00Z"),
  injuries: false,
  policeInvolved: false,
  childId: "child-1",
  ...over,
});

const keys = (f: IncidentFacts) => tasksFor(f).map((t) => t.key);

describe("every rule cites a regulation", () => {
  it("has a non-empty regulation on every rule", () => {
    for (const r of INCIDENT_RULES) expect(r.task.regulation.length, r.key).toBeGreaterThan(3);
  });
  it("rule keys are unique", () => {
    const ks = INCIDENT_RULES.map((r) => r.key);
    expect(new Set(ks).size).toBe(ks.length);
  });
});

describe("physical intervention", () => {
  it("creates child's view, staff debrief, manager sign-off, risk review and manager review", () => {
    const k = keys(base({ type: "physical_intervention" }));
    expect(k).toEqual(expect.arrayContaining(["pi.childs_view", "pi.staff_debrief", "pi.manager_sign", "pi.risk_assessment_review", "incident.manager_review", "incident.placing_authority"]));
    expect(k).not.toContain("pi.medical_check");
  });
  it("adds a medical check when there were injuries", () => {
    expect(keys(base({ type: "physical_intervention", injuries: true }))).toContain("pi.medical_check");
  });
  it("child's view on the Reg 35 record is due within 24 hours", () => {
    const t = tasksFor(base({ type: "physical_intervention" })).find((x) => x.key === "pi.childs_view")!;
    expect(dueDate(base().occurredAt, t.dueHours).toISOString()).toBe("2026-10-23T19:00:00.000Z");
  });
});

describe("missing", () => {
  it("creates police, return conversation, independent interview, Ofsted and risk review tasks", () => {
    expect(keys(base({ type: "missing" }))).toEqual(expect.arrayContaining(["missing.police", "missing.return_conversation", "missing.independent_interview", "missing.ofsted", "missing.risk_review"]));
  });
  it("police task is due within an hour", () => {
    expect(tasksFor(base({ type: "missing" })).find((t) => t.key === "missing.police")!.dueHours).toBe(1);
  });
  it("defaults to notifying Ofsted, LA and police", () => {
    expect(defaultNotifications({ type: "missing", severity: "medium" })).toEqual({ notifyOfsted: true, notifyPlacingAuthority: true, notifyPolice: true, notifyLado: false });
  });
});

describe("allegation against staff", () => {
  it("creates LADO, RI and Ofsted tasks", () => {
    expect(keys(base({ type: "allegation_against_staff" }))).toEqual(expect.arrayContaining(["allegation.lado", "allegation.ri", "safeguarding.ofsted"]));
    expect(defaultNotifications({ type: "allegation_against_staff", severity: "high" }).notifyLado).toBe(true);
  });
});

describe("accident severity", () => {
  it("minor accident does not notify Ofsted; serious does", () => {
    expect(keys(base({ type: "accident", severity: "low" }))).not.toContain("accident.ofsted");
    expect(keys(base({ type: "accident", severity: "high" }))).toContain("accident.ofsted");
    expect(keys(base({ type: "accident", severity: "critical" }))).toContain("accident.riddor");
  });
});

describe("home-level incidents", () => {
  it("property damage with no child has only the manager review", () => {
    expect(keys(base({ type: "property_damage", childId: null }))).toEqual(["incident.manager_review"]);
  });
  it("critical anything informs the RI", () => {
    expect(keys(base({ type: "incident", severity: "critical" }))).toContain("incident.ri_informed");
  });
});

describe("complaints", () => {
  it("acknowledge in 3 days, respond in 28", () => {
    const t = tasksFor(base({ type: "complaint" }));
    expect(t.find((x) => x.key === "complaint.acknowledge")!.dueHours).toBe(72);
    expect(t.find((x) => x.key === "complaint.respond")!.dueHours).toBe(28 * 24);
  });
});
