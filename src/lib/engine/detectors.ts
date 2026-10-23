import "server-only";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { children, childVoice, dailyLogs, homes, incidents, keyworkSessions, medications, notifications, placementPlans, placements, riskAssessments } from "@/db/schema";
import { checksBoard, homeDocumentsList, staffCompliance } from "@/lib/operations/queries";
import { missingLogs } from "@/lib/daily/queries";
import { isOverdue } from "@/lib/records/lifecycle";
import { reg44DueOn, reg45DueOn } from "@/lib/rules/governance";
import type { Finding } from "@/lib/rules/engine";

const DAY = 86_400_000;
type Detector = (homeId: string, organisationId: string, now: Date) => Promise<Finding[]>;

const activeChildren = (homeId: string) => db.select({ id: children.id, firstName: children.firstName, lastName: children.lastName, keyWorkerUserId: children.keyWorkerUserId }).from(children).where(and(eq(children.homeId, homeId), isNull(children.archivedAt)));
const name = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`;

export const DETECTORS: Record<string, Detector> = {
  async "risk.review_overdue"(homeId, _org, now) {
    const kids = await activeChildren(homeId);
    if (!kids.length) return [];
    const rows = await db.select().from(riskAssessments).where(and(inArray(riskAssessments.childId, kids.map((k) => k.id)), sql`${riskAssessments.id} NOT IN (SELECT supersedes_id FROM risk_assessments WHERE supersedes_id IS NOT NULL)`));
    return rows.filter((r) => isOverdue(r.reviewDueOn, now)).map((r) => { const c = kids.find((k) => k.id === r.childId)!; return { subjectKey: `risk_assessment:${r.id}`, title: `Review risk assessment "${r.title}" for ${name(c)}`, detail: `Was due ${r.reviewDueOn.toLocaleDateString("en-GB")}`, childId: c.id, ownerUserId: c.keyWorkerUserId, dueAt: now }; });
  },
  async "plan.missing"(homeId, _org, now) {
    const kids = await activeChildren(homeId);
    const out: Finding[] = [];
    for (const c of kids) {
      const [p] = await db.select({ admittedOn: placements.admittedOn }).from(placements).where(and(eq(placements.childId, c.id), isNull(placements.dischargedOn))).limit(1);
      if (!p || now.getTime() - p.admittedOn.getTime() < 5 * DAY) continue;
      const [plan] = await db.select({ id: placementPlans.id }).from(placementPlans).where(eq(placementPlans.childId, c.id)).limit(1);
      if (!plan) out.push({ subjectKey: `child:${c.id}`, title: `Write a placement plan for ${name(c)}`, detail: `Admitted ${p.admittedOn.toLocaleDateString("en-GB")}; Reg 17 requires a plan at or before admission`, childId: c.id, dueAt: new Date(now.getTime() + 2 * DAY) });
    }
    return out;
  },
  async "plan.review_overdue"(homeId, _org, now) {
    const kids = await activeChildren(homeId);
    if (!kids.length) return [];
    const plans = await db.select().from(placementPlans).where(and(inArray(placementPlans.childId, kids.map((k) => k.id)), sql`${placementPlans.id} NOT IN (SELECT supersedes_id FROM placement_plans WHERE supersedes_id IS NOT NULL)`));
    return plans.filter((p) => isOverdue(p.reviewDueOn, now)).map((p) => { const c = kids.find((k) => k.id === p.childId)!; return { subjectKey: `placement_plan:${p.id}`, title: `Review the placement plan for ${name(c)}`, childId: c.id, dueAt: now }; });
  },
  async "supervision.overdue"(homeId, org, now) {
    const team = await staffCompliance(org, homeId, now);
    return team.filter((t) => t.supervisionStatus === "overdue" || t.supervisionStatus === "never").map((t) => ({ subjectKey: `user:${t.userId}`, title: `Supervision overdue — ${t.fullName}`, detail: t.lastSupervision ? `Last held ${t.lastSupervision.toLocaleDateString("en-GB")}` : "No supervision recorded", dueAt: now }));
  },
  async "schedule2.incomplete"(homeId, org, now) {
    const team = await staffCompliance(org, homeId, now);
    return team.filter((t) => t.schedule2Missing.length > 0).map((t) => ({ subjectKey: `user:${t.userId}`, title: `Complete the Schedule 2 file — ${t.fullName}`, detail: t.schedule2Missing.join(", "), dueAt: new Date(now.getTime() + 7 * DAY) }));
  },
  async "training.expired"(homeId, org, now) {
    const team = await staffCompliance(org, homeId, now);
    return team.filter((t) => t.training.expired > 0 || t.training.mandatoryMissing.length > 0).map((t) => ({ subjectKey: `user:${t.userId}`, title: `Training gaps — ${t.fullName}`, detail: `${t.training.expired} expired; missing: ${t.training.mandatoryMissing.join(", ") || "none"}`, dueAt: new Date(now.getTime() + 14 * DAY) }));
  },
  async "staff.level3_overdue"(homeId, org, now) {
    const team = await staffCompliance(org, homeId, now);
    return team.filter((t) => t.level3 === "overdue").map((t) => ({ subjectKey: `user:${t.userId}`, title: `Level 3 Diploma overdue — ${t.fullName}`, dueAt: now }));
  },
  async "reg44.overdue"(homeId, _org, now) {
    const [h] = await db.select().from(homes).where(eq(homes.id, homeId)).limit(1);
    const [last] = await db.select({ visitedOn: sql<Date>`max(visited_on)` }).from(sql`reg44_visits`).where(sql`home_id = ${homeId} and supersedes_id is null`);
    const lastOn = last?.visitedOn ? new Date(last.visitedOn) : null;
    const due = reg44DueOn(lastOn, h.createdAt);
    return now > due ? [{ subjectKey: `home:${homeId}:reg44`, title: `Arrange the Reg 44 independent visit — overdue`, detail: lastOn ? `Last visit ${lastOn.toLocaleDateString("en-GB")}` : "No visit recorded", dueAt: due }] : [];
  },
  async "reg45.due"(homeId, _org, now) {
    const [h] = await db.select().from(homes).where(eq(homes.id, homeId)).limit(1);
    const [last] = await db.select({ periodTo: sql<Date>`max(period_to)` }).from(sql`reg45_reviews`).where(sql`home_id = ${homeId} and supersedes_id is null and status = 'locked'`);
    const lastTo = last?.periodTo ? new Date(last.periodTo) : null;
    const due = reg45DueOn(lastTo, h.createdAt);
    const [draft] = await db.select({ id: sql<string>`id` }).from(sql`reg45_reviews`).where(sql`home_id = ${homeId} and status <> 'locked' and supersedes_id is null`).limit(1);
    if (draft) return [];
    return due.getTime() - now.getTime() < 30 * DAY ? [{ subjectKey: `home:${homeId}:reg45`, title: now > due ? "Reg 45 quality of care review — overdue" : "Reg 45 quality of care review due", dueAt: due }] : [];
  },
  async "logs.missing"(homeId, _org, now) {
    const gaps = await missingLogs(homeId, 7);
    if (!gaps.length) return [];
    const wk = `${now.getUTCFullYear()}-W${Math.ceil(((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / DAY + 1) / 7)}`;
    return [{ subjectKey: `home:${homeId}:logs:${wk}`, title: `${gaps.length} child-day${gaps.length > 1 ? "s" : ""} without a daily log in the last 7 days`, detail: gaps.slice(0, 8).map((g) => `${g.name} ${g.date}`).join("; "), dueAt: now }];
  },
  async "logs.unreviewed"(homeId, _org, now) {
    const rows = await db.select({ id: dailyLogs.id, childId: dailyLogs.childId, logDate: dailyLogs.logDate }).from(dailyLogs).where(and(eq(dailyLogs.homeId, homeId), eq(dailyLogs.status, "submitted"), lt(dailyLogs.submittedAt, new Date(now.getTime() - 3 * DAY))));
    if (!rows.length) return [];
    return [{ subjectKey: `home:${homeId}:logs_unreviewed`, title: `${rows.length} daily log${rows.length > 1 ? "s" : ""} waiting more than 3 days for review`, dueAt: now }];
  },
  async "notification.unsent"(homeId, _org, now) {
    const incs = await db.select().from(incidents).where(and(eq(incidents.homeId, homeId), isNull(incidents.supersedesId), lt(incidents.occurredAt, new Date(now.getTime() - DAY)), sql`${incidents.occurredAt} > now() - interval '90 days'`));
    const out: Finding[] = [];
    for (const i of incs) {
      const sent = await db.select({ recipient: notifications.recipient }).from(notifications).where(eq(notifications.incidentId, i.id));
      const have = new Set(sent.map((s) => s.recipient));
      const missing: string[] = [];
      if (i.notifyOfsted && !have.has("ofsted")) missing.push("Ofsted");
      if (i.notifyPlacingAuthority && !have.has("placing_authority")) missing.push("placing authority");
      if (i.notifyPolice && !have.has("police")) missing.push("police");
      if (i.notifyLado && !have.has("lado")) missing.push("LADO");
      if (missing.length) out.push({ subjectKey: `incident:${i.id}`, title: `Notification${missing.length > 1 ? "s" : ""} not recorded as sent: ${missing.join(", ")}`, detail: `Incident on ${i.occurredAt.toLocaleDateString("en-GB")}`, childId: i.childId, dueAt: new Date(i.occurredAt.getTime() + DAY) });
    }
    return out;
  },
  async "incident.unreviewed"(homeId, _org, now) {
    const rows = await db.select({ id: incidents.id, occurredAt: incidents.occurredAt, type: incidents.type, childId: incidents.childId }).from(incidents).where(and(eq(incidents.homeId, homeId), isNull(incidents.supersedesId), eq(incidents.status, "submitted"), lt(incidents.submittedAt, new Date(now.getTime() - 3 * DAY))));
    return rows.map((i) => ({ subjectKey: `incident:${i.id}`, title: `Review and lock the ${i.type.replace(/_/g, " ")} record from ${i.occurredAt.toLocaleDateString("en-GB")}`, childId: i.childId, dueAt: new Date(i.occurredAt.getTime() + 3 * DAY) }));
  },
  async "checks.overdue"(homeId, _org, now) {
    const board = await checksBoard(homeId, now);
    return board.filter((b) => b.status === "overdue").map((b) => ({ subjectKey: `check_type:${b.type.id}`, title: `${b.type.name} overdue`, detail: `Due ${b.dueOn.toLocaleDateString("en-GB")} · ${b.type.regulation ?? ""}`, dueAt: b.dueOn }));
  },
  async "sop.missing"(homeId, _org, now) {
    const docs = (await homeDocumentsList(homeId)).filter((d) => d.current);
    const sop = docs.find((d) => d.d.kind === "statement_of_purpose");
    if (!sop) return [{ subjectKey: `home:${homeId}:sop`, title: "No current Statement of Purpose on file", dueAt: now }];
    if (!sop.d.ofstedNotifiedOn) return [{ subjectKey: `home:${homeId}:sop_notify:${sop.d.id}`, title: `Notify Ofsted of Statement of Purpose v${sop.d.version}`, dueAt: now }];
    return [];
  },
  async "policy.review_overdue"(homeId, _org, now) {
    const docs = (await homeDocumentsList(homeId)).filter((d) => d.current && d.d.kind === "policy" && isOverdue(d.d.reviewDueOn, now));
    return docs.map((d) => ({ subjectKey: `home_document:${d.d.id}`, title: `Review policy: ${d.d.title} (v${d.d.version})`, dueAt: now }));
  },
  async "voice.unanswered"(homeId, _org, now) {
    const kids = await activeChildren(homeId);
    if (!kids.length) return [];
    const rows = await db.select().from(childVoice).where(and(inArray(childVoice.childId, kids.map((k) => k.id)), isNull(childVoice.outcome), lt(childVoice.recordedOn, new Date(now.getTime() - 7 * DAY))));
    return rows.map((v) => { const c = kids.find((k) => k.id === v.childId)!; return { subjectKey: `child_voice:${v.id}`, title: `Record the outcome of what ${c.firstName} said on ${v.recordedOn.toLocaleDateString("en-GB")}`, detail: `“${v.whatTheChildSaid.slice(0, 120)}”`, childId: c.id, ownerUserId: c.keyWorkerUserId, dueAt: now }; });
  },
  async "keywork.stale"(homeId, _org, now) {
    const kids = await activeChildren(homeId);
    const out: Finding[] = [];
    for (const c of kids) {
      const [p] = await db.select({ admittedOn: placements.admittedOn }).from(placements).where(and(eq(placements.childId, c.id), isNull(placements.dischargedOn))).limit(1);
      if (!p || now.getTime() - p.admittedOn.getTime() < 28 * DAY) continue;
      const [k] = await db.select({ sessionDate: keyworkSessions.sessionDate }).from(keyworkSessions).where(eq(keyworkSessions.childId, c.id)).orderBy(desc(keyworkSessions.sessionDate)).limit(1);
      if (!k || now.getTime() - k.sessionDate.getTime() > 28 * DAY) out.push({ subjectKey: `child:${c.id}:keywork`, title: `Key-work session with ${name(c)}`, detail: k ? `Last session ${k.sessionDate.toLocaleDateString("en-GB")}` : "No session recorded", childId: c.id, ownerUserId: c.keyWorkerUserId, dueAt: new Date(now.getTime() + 7 * DAY) });
    }
    return out;
  },
  async "medication.consent_missing"(homeId, _org, now) {
    const rows = await db.select({ m: medications, first: children.firstName, last: children.lastName }).from(medications).innerJoin(children, eq(children.id, medications.childId)).where(and(eq(medications.homeId, homeId), isNull(children.archivedAt), isNull(medications.consentRecordedOn), sql`(${medications.endOn} IS NULL OR ${medications.endOn} >= current_date)`));
    return rows.map(({ m, first, last }) => ({ subjectKey: `medication:${m.id}`, title: `Record consent for ${m.name} — ${first} ${last}`, childId: m.childId, dueAt: new Date(now.getTime() + 3 * DAY) }));
  },
};
