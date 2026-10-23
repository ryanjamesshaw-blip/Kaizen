/**
 * Mock inspection scoring — pure. Maps the home's metrics and open rule
 * findings onto the three SCCIF judgement areas. The AI writes the narrative
 * on top of this; it never changes the scores.
 */
import type { HomeMetrics } from "@/lib/governance/metrics";

export type Judgement = "outstanding" | "good" | "requires_improvement" | "inadequate";
export type AreaKey = "experiences" | "protection" | "leadership";

export type AreaResult = {
  area: AreaKey;
  title: string;
  points: number; // 0–100
  judgement: Judgement;
  evidence: string[]; // positive, from the data
  concerns: string[]; // negative, from the data
};

export const AREA_TITLES: Record<AreaKey, string> = {
  experiences: "Overall experiences and progress of children",
  protection: "How well children are helped and protected",
  leadership: "The effectiveness of leaders and managers",
};

export const JUDGEMENT_LABEL: Record<Judgement, string> = { outstanding: "Outstanding", good: "Good", requires_improvement: "Requires improvement to be good", inadequate: "Inadequate" };

function judge(points: number, hardFail: boolean): Judgement {
  if (hardFail) return "inadequate";
  if (points >= 90) return "outstanding";
  if (points >= 70) return "good";
  if (points >= 45) return "requires_improvement";
  return "inadequate";
}

export function scoreInspection(m: HomeMetrics, openFindings: Record<string, number>): { areas: AreaResult[]; overall: Judgement } {
  const f = (k: string) => openFindings[k] ?? 0;
  const areas: AreaResult[] = [];

  // --- Experiences and progress ---
  {
    let p = 100; const ev: string[] = []; const co: string[] = [];
    if (m.children.placed > 0 && m.recording.logsInPeriod > 0) ev.push(`${m.recording.logsInPeriod} daily logs recorded in the period`);
    if (m.recording.missingLogDays7 > 0) { p -= Math.min(20, m.recording.missingLogDays7 * 3); co.push(`${m.recording.missingLogDays7} child-days without a daily log in the last week`); }
    if (m.recording.keyworkInPeriod > 0) ev.push(`${m.recording.keyworkInPeriod} key-work sessions recorded`); else { p -= 15; co.push("No key-work sessions recorded in the period"); }
    if (f("keywork.stale") > 0) { p -= 10; co.push(`${f("keywork.stale")} child(ren) with no key-work in four weeks`); }
    if (m.recording.voiceUnanswered > 0) { p -= Math.min(15, m.recording.voiceUnanswered * 5); co.push(`${m.recording.voiceUnanswered} things children said have no recorded outcome`); } else if (m.children.placed > 0) ev.push("Every recorded child's-voice item has an outcome");
    if (f("plan.missing") > 0) { p -= 20; co.push(`${f("plan.missing")} child(ren) without a placement plan`); } else if (m.children.placed > 0) ev.push("Every placed child has a placement plan");
    if (f("plan.review_overdue") > 0) { p -= 8; co.push("Placement plan review overdue"); }
    if (m.medication.errors > 0) { p -= 10; co.push(`${m.medication.errors} medication error(s)`); }
    if (f("medication.consent_missing") > 0) { p -= 5; co.push("Medication without recorded consent"); }
    areas.push({ area: "experiences", title: AREA_TITLES.experiences, points: Math.max(0, p), judgement: judge(Math.max(0, p), false), evidence: ev, concerns: co });
  }

  // --- Help and protection ---
  {
    let p = 100; const ev: string[] = []; const co: string[] = []; let hard = false;
    if (m.risk.current > 0) ev.push(`${m.risk.current} current risk assessments`);
    if (m.risk.overdueReview > 0) { p -= Math.min(25, m.risk.overdueReview * 8); co.push(`${m.risk.overdueReview} risk assessment(s) overdue for review`); } else if (m.risk.current > 0) ev.push("All risk assessments reviewed on time");
    if (f("notification.unsent") > 0) { p -= 25; hard = f("notification.unsent") >= 2; co.push(`${f("notification.unsent")} required notification(s) not recorded as sent (Reg 40)`); }
    if (m.incidents.restraint > 0) ev.push(`${m.incidents.restraint} physical intervention(s) recorded with Reg 35 records`);
    if (m.incidents.missing > 0) ev.push(`${m.incidents.missing} missing episode(s) recorded with return procedures`);
    if (m.followUps.overdue > 0) { p -= Math.min(20, m.followUps.overdue * 2); co.push(`${m.followUps.overdue} safeguarding and incident follow-ups overdue`); }
    if (f("incident.unreviewed") > 0) { p -= 10; co.push(`${f("incident.unreviewed")} incident record(s) not reviewed by a manager`); }
    if (m.incidents.allegations > 0) co.push(`${m.incidents.allegations} allegation(s) against staff in the period — check LADO referral evidence`);
    if (m.checks.overdue > 0) { p -= Math.min(15, m.checks.overdue * 4); co.push(`${m.checks.overdue} safety/fire check(s) overdue`); } else if (m.checks.total > 0) ev.push("Fire and safety checks all in date");
    if (m.checks.failedLast > 0) { p -= 5; co.push(`${m.checks.failedLast} check(s) failed at last test`); }
    if (m.staff.schedule2Incomplete > 0) { p -= 15; co.push(`${m.staff.schedule2Incomplete} staff working with incomplete Schedule 2 files`); } else if (m.staff.careStaff > 0) ev.push("Schedule 2 complete for every member of care staff");
    areas.push({ area: "protection", title: AREA_TITLES.protection, points: Math.max(0, p), judgement: judge(Math.max(0, p), hard), evidence: ev, concerns: co });
  }

  // --- Leaders and managers ---
  {
    let p = 100; const ev: string[] = []; const co: string[] = []; let hard = false;
    if (m.governance.reg44Status === "overdue") { p -= 20; co.push("Regulation 44 visit overdue"); } else ev.push(`Reg 44 visits on schedule (${m.governance.reg44InPeriod} in period)`);
    if (m.governance.reg45Status === "overdue") { p -= 20; co.push("Regulation 45 review overdue"); } else ev.push("Reg 45 review in date");
    if (!m.governance.sopOnFile) { p -= 20; hard = true; co.push("No Statement of Purpose on file"); } else if (!m.governance.sopNotified) { p -= 10; co.push("Statement of Purpose not notified to Ofsted"); } else ev.push("Statement of Purpose current and notified");
    if (m.staff.supervisionOverdue > 0) { p -= Math.min(20, m.staff.supervisionOverdue * 7); co.push(`${m.staff.supervisionOverdue} staff overdue for supervision`); } else if (m.staff.careStaff > 0) ev.push("Supervision up to date for all care staff");
    if (m.staff.trainingExpired > 0) { p -= Math.min(15, m.staff.trainingExpired * 3); co.push(`${m.staff.trainingExpired} expired training certificate(s)`); }
    if (m.staff.level3Overdue > 0) { p -= 8; co.push(`${m.staff.level3Overdue} staff past the two-year Level 3 deadline`); }
    if (m.governance.policiesOverdue > 0) { p -= 5; co.push(`${m.governance.policiesOverdue} polic(y/ies) overdue review`); }
    if (m.recording.awaitingReview > 0) { p -= Math.min(10, m.recording.awaitingReview); co.push(`${m.recording.awaitingReview} daily logs awaiting manager review`); }
    if (m.followUps.completedInPeriod > 0) ev.push(`${m.followUps.completedInPeriod} follow-up actions completed in the period`);
    areas.push({ area: "leadership", title: AREA_TITLES.leadership, points: Math.max(0, p), judgement: judge(Math.max(0, p), hard), evidence: ev, concerns: co });
  }

  const order: Judgement[] = ["inadequate", "requires_improvement", "good", "outstanding"];
  const worst = areas.reduce((w, a) => (order.indexOf(a.judgement) < order.indexOf(w) ? a.judgement : w), "outstanding" as Judgement);
  // SCCIF: overall experiences cannot be better than help-and-protection or leadership; inadequate anywhere caps overall.
  const overall = worst === "inadequate" ? "inadequate" : worst;
  return { areas, overall };
}
