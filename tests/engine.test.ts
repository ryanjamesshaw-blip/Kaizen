import { describe, it, expect } from "vitest";
import { reconcile, complianceScore, scoreBand, RULES, RULE_BY_KEY, type ExistingTask, type Finding } from "@/lib/rules/engine";

const rule = RULE_BY_KEY["risk.review_overdue"];
const now = new Date("2026-10-23T10:00:00Z");
const f = (k: string): Finding => ({ subjectKey: k, title: "t", dueAt: now });
const t = (k: string, over: Partial<ExistingTask> = {}): ExistingTask => ({ id: `task-${k}`, ruleKey: rule.key, subjectKey: k, status: "open", dueAt: now, escalatedAt: null, ...over });

describe("reconcile", () => {
  it("creates tasks for new findings only", () => {
    const r = reconcile(rule, [f("a"), f("b")], [t("a")], now);
    expect(r.create.map((x) => x.subjectKey)).toEqual(["b"]);
    expect(r.resolve).toEqual([]);
  });
  it("resolves open tasks whose finding has gone", () => {
    const r = reconcile(rule, [f("a")], [t("a"), t("gone")], now);
    expect(r.resolve).toEqual(["task-gone"]);
  });
  it("is idempotent", () => {
    const r = reconcile(rule, [f("a")], [t("a")], now);
    expect(r.create).toEqual([]); expect(r.resolve).toEqual([]); expect(r.escalate).toEqual([]);
  });
  it("ignores other rules' tasks and closed tasks", () => {
    const r = reconcile(rule, [], [t("x", { ruleKey: "other" }), t("y", { status: "done" })], now);
    expect(r.resolve).toEqual([]);
  });
  it("escalates once after the window", () => {
    const old = new Date(now.getTime() - 10 * 86_400_000);
    const r1 = reconcile(rule, [f("a")], [t("a", { dueAt: old })], now);
    expect(r1.escalate.map((e) => e.taskId)).toEqual(["task-a"]);
    const r2 = reconcile(rule, [f("a")], [t("a", { dueAt: old, escalatedAt: now })], now);
    expect(r2.escalate).toEqual([]);
    const r3 = reconcile(rule, [f("a")], [t("a", { dueAt: new Date(now.getTime() - 2 * 86_400_000) })], now);
    expect(r3.escalate).toEqual([]);
  });
});

describe("rules catalogue", () => {
  it("every rule has a regulation and unique key", () => {
    expect(new Set(RULES.map((r) => r.key)).size).toBe(RULES.length);
    for (const r of RULES) expect(r.regulation.length).toBeGreaterThan(3);
  });
});

describe("score", () => {
  it("is 100 with no findings and never below 0", () => {
    expect(complianceScore({}).score).toBe(100);
    expect(complianceScore(Object.fromEntries(RULES.map((r) => [r.key, 100]))).score).toBe(0);
  });
  it("caps per rule and orders deductions", () => {
    const s = complianceScore({ "risk.review_overdue": 10, "logs.missing": 2 });
    expect(s.deductions[0]).toEqual({ key: "risk.review_overdue", points: 20, findings: 10 });
    expect(s.score).toBe(100 - 20 - 2);
  });
  it("bands", () => {
    expect(scoreBand(90).tone).toBe("ok"); expect(scoreBand(70).tone).toBe("warn"); expect(scoreBand(40).tone).toBe("bad");
  });
});
