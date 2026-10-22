import { describe, it, expect } from "vitest";
import { canonicalJson, computeHash, verifyChain, type AuditContent } from "@/lib/audit/hash";

const base = (over: Partial<AuditContent> = {}): AuditContent => ({
  occurredAt: "2026-10-22T16:00:00.000Z",
  organisationId: "o",
  homeId: "h",
  actorUserId: "u",
  actorRole: "care_worker",
  action: "create",
  entityType: "daily_log",
  entityId: "d1",
  diff: { after: { text: "hello" } },
  reason: null,
  ipAddress: null,
  userAgent: null,
  ...over,
});

describe("canonicalJson", () => {
  it("hashes a Date the same as the ISO string Postgres will return", () => {
    expect(canonicalJson({ at: new Date("2026-10-22T00:00:00.000Z") })).toBe(canonicalJson({ at: "2026-10-22T00:00:00.000Z" }));
  });
  it("drops undefined and keeps null", () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });
  it("is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
});

describe("chain", () => {
  function build(contents: AuditContent[]) {
    const out: Array<AuditContent & { seq: number; prevHash: string | null; hash: string }> = [];
    let prev: string | null = null;
    contents.forEach((c, i) => {
      const hash = computeHash(prev, c);
      out.push({ ...c, seq: i + 1, prevHash: prev, hash });
      prev = hash;
    });
    return out;
  }

  it("verifies an intact chain", () => {
    const chain = build([base(), base({ action: "update" }), base({ action: "lock" })]);
    expect(verifyChain(chain)).toBeNull();
  });

  it("detects a changed historical row", () => {
    const chain = build([base(), base({ action: "update" }), base({ action: "lock" })]);
    chain[1].reason = "tampered";
    expect(verifyChain(chain)).toBe(2);
  });

  it("detects a removed row", () => {
    const chain = build([base(), base({ action: "update" }), base({ action: "lock" })]);
    chain.splice(1, 1);
    expect(verifyChain(chain)).toBe(3);
  });

  it("detects an inserted row", () => {
    const chain = build([base(), base({ action: "lock" })]);
    const forged = { ...base({ action: "delete" }), seq: 2, prevHash: chain[0].hash, hash: "0000" };
    chain.splice(1, 0, forged);
    expect(verifyChain(chain)).toBe(2);
  });
});
