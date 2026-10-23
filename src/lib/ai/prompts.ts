/**
 * Prompt builders — pure. Each takes material already scoped to what the
 * requesting user may see and returns the text the model gets. Versioned so
 * every draft records which prompt produced it.
 */
import type { HomeMetrics } from "@/lib/governance/metrics";
import type { AreaResult, Judgement } from "@/lib/rules/inspection";
import { QUALITY_STANDARDS, RATING_LABEL } from "@/lib/rules/governance";
import { JUDGEMENT_LABEL } from "@/lib/rules/inspection";

export const PROMPT_VERSIONS = { reg45: "reg45-v1", chronology: "chronology-v1", logFeedback: "log-feedback-v1", mockInspection: "mock-inspection-v1" } as const;

const d = (x: Date | string | null | undefined) => (x ? new Date(x).toLocaleDateString("en-GB") : "—");

function metricsBlock(m: HomeMetrics): string {
  return [
    `Period ${d(m.period.from)} to ${d(m.period.to)}. Children placed: ${m.children.placed}${m.children.capacity ? ` of ${m.children.capacity}` : ""}; admitted ${m.children.admitted}; left ${m.children.discharged}.`,
    `Incidents: ${m.incidents.total} (high/critical ${m.incidents.highOrCritical}; physical interventions ${m.incidents.restraint}; missing ${m.incidents.missing}; safeguarding ${m.incidents.safeguarding}; allegations ${m.incidents.allegations}; complaints ${m.incidents.complaints}; medication errors ${m.incidents.medicationErrors}).`,
    `Follow-ups: ${m.followUps.open} open, ${m.followUps.overdue} overdue, ${m.followUps.completedInPeriod} completed in period.`,
    `Risk assessments: ${m.risk.current} current, ${m.risk.overdueReview} overdue review.`,
    `Recording: ${m.recording.logsInPeriod} daily logs; ${m.recording.missingLogDays7} child-days missing a log in the last 7 days; ${m.recording.awaitingReview} awaiting review; ${m.recording.keyworkInPeriod} key-work sessions; ${m.recording.voiceUnanswered} child's-voice items without an outcome.`,
    `Medication: ${m.medication.refusedOrMissed} refused/missed; ${m.medication.errors} errors.`,
    `Staff: ${m.staff.careStaff} care staff; ${m.staff.supervisionOverdue} supervision overdue; ${m.staff.schedule2Incomplete} Schedule 2 files incomplete; ${m.staff.trainingExpired} expired training; ${m.staff.level3Overdue} Level 3 overdue.`,
    `Checks: ${m.checks.total} scheduled, ${m.checks.overdue} overdue, ${m.checks.failedLast} failed last time.`,
    `Governance: Reg 44 last ${d(m.governance.lastReg44)} (${m.governance.reg44Status}), ${m.governance.reg44InPeriod} visits in period; Reg 45 last period ended ${d(m.governance.lastReg45To)} (${m.governance.reg45Status}); Statement of Purpose ${m.governance.sopOnFile ? (m.governance.sopNotified ? "on file and notified" : "on file, NOT notified to Ofsted") : "MISSING"}; ${m.governance.policiesOverdue} policies overdue review.`,
  ].map((l) => `- ${l}`).join("\n");
}

export function reg45Prompt(input: { homeName: string; metrics: HomeMetrics; standards: Array<{ regulation: number; rating: string; evidence: string; actions: string }>; previousSummary: string | null; feedbackFromChildren: string | null; feedbackFromOthers: string | null; reg44Findings: string[] }): string {
  return [
    `TASK: Draft the narrative sections of a Regulation 45 quality of care review for ${input.homeName}.`,
    ``, `THE NUMBERS FOR THE PERIOD (from the home's records):`, metricsBlock(input.metrics),
    ``, `MANAGER'S OWN ASSESSMENT PER QUALITY STANDARD (may be partial):`,
    ...input.standards.map((s) => { const q = QUALITY_STANDARDS.find((x) => x.regulation === s.regulation); return `- Reg ${s.regulation} ${q?.name ?? ""}: ${RATING_LABEL[s.rating] ?? s.rating}. Evidence: ${s.evidence || "(none written yet)"}. Actions: ${s.actions || "(none)"}`; }),
    ``, `REG 44 INDEPENDENT VISITOR FINDINGS IN THE PERIOD:`, ...(input.reg44Findings.length ? input.reg44Findings.map((f) => `- ${f}`) : ["- None recorded"]),
    ``, `FEEDBACK FROM CHILDREN: ${input.feedbackFromChildren || "(none recorded)"}`, `FEEDBACK FROM OTHERS: ${input.feedbackFromOthers || "(none recorded)"}`,
    ``, `PREVIOUS REVIEW SUMMARY: ${input.previousSummary || "(none)"}`,
    ``, `Write, with these exact headings: "Summary", "Strengths", "Areas for improvement", "Progress since the last review", then one short paragraph per quality standard headed "Reg N — name" that evaluates the evidence against that standard and says what the home should do next. Keep each paragraph to 3–6 sentences. Use only the material above.`,
  ].join("\n");
}

export function chronologyPrompt(input: { firstName: string; age: number; placedSince: Date; legalStatus: string; entries: Array<{ on: Date; category: string; summary: string; detail: string | null }>; incidents: Array<{ at: Date; type: string; severity: string }>; voice: Array<{ on: Date; said: string; outcome: string | null }> }): string {
  return [
    `TASK: Write a chronology summary for ${input.firstName}, aged ${input.age}, placed since ${d(input.placedSince)} (${input.legalStatus}).`,
    ``, `CHRONOLOGY ENTRIES (oldest first):`, ...input.entries.map((e) => `- ${d(e.on)} [${e.category}] ${e.summary}${e.detail ? ` — ${e.detail}` : ""}`),
    ``, `INCIDENTS (newest first):`, ...(input.incidents.length ? input.incidents.map((i) => `- ${d(i.at)} ${i.type.replace(/_/g, " ")} (${i.severity})`) : ["- None"]),
    ``, `IN ${input.firstName.toUpperCase()}'S OWN WORDS:`, ...(input.voice.length ? input.voice.map((v) => `- ${d(v.on)}: "${v.said}"${v.outcome ? ` → ${v.outcome}` : " → no outcome recorded"}`) : ["- Nothing recorded"]),
    ``, `Write a summary a new social worker or IRO could read in two minutes: "Placement so far" (the story in order, 1–2 paragraphs), "Patterns" (what recurs — triggers, times, people — only if the material shows it), "What ${input.firstName} has said", and "Gaps in the record" (anything an inspector would expect to see that is not here). Plain English, first name only, no speculation.`,
  ].join("\n");
}

export function logFeedbackPrompt(input: { firstName: string; logDate: Date; shift: string; narrative: string; positives: string | null; concerns: string | null; prompts: Record<string, string | boolean | null> }): string {
  return [
    `TASK: Give a care worker brief, kind, specific feedback on this daily log for ${input.firstName} (${d(input.logDate)}, ${input.shift} shift).`,
    ``, `NARRATIVE:`, input.narrative, ``, `POSITIVES: ${input.positives || "(blank)"}`, `CONCERNS: ${input.concerns || "(blank)"}`,
    `PROMPTS: ${Object.entries(input.prompts).map(([k, v]) => `${k}=${v ?? "blank"}`).join("; ")}`,
    ``, `Assess it against: (1) written so ${input.firstName} could read it as an adult without feeling judged — no labels, no jargon, no opinions presented as facts; (2) factual and in time order; (3) ${input.firstName}'s own voice and views present; (4) anything that should have been an incident record or a safeguarding concern but is only in the narrative; (5) gaps a manager would ask about. Give "What works" (2–3 bullets), "What to change" (2–4 bullets, each with a rewritten example sentence where useful) and "Anything that needs escalating" (or "Nothing"). Under 250 words.`,
  ].join("\n");
}

export function mockInspectionPrompt(input: { homeName: string; metrics: HomeMetrics; areas: AreaResult[]; overall: Judgement; openFindings: Array<{ rule: string; title: string; regulation: string }>; reg44Findings: string[]; childVoice: string[] }): string {
  return [
    `TASK: Write a mock inspection report for ${input.homeName} under the SCCIF, with an action plan. Judgements have already been determined from the records; do not change them.`,
    ``, `JUDGEMENTS:`, ...input.areas.map((a) => `- ${a.title}: ${JUDGEMENT_LABEL[a.judgement]} (${a.points}/100). Evidence: ${a.evidence.join("; ") || "none"}. Concerns: ${a.concerns.join("; ") || "none"}.`), `- Overall: ${JUDGEMENT_LABEL[input.overall]}`,
    ``, `THE NUMBERS:`, metricsBlock(input.metrics),
    ``, `OPEN COMPLIANCE FINDINGS (from the audit engine):`, ...(input.openFindings.length ? input.openFindings.map((f) => `- ${f.title} (${f.regulation})`) : ["- None"]),
    ``, `REG 44 VISITOR FINDINGS:`, ...(input.reg44Findings.length ? input.reg44Findings.map((f) => `- ${f}`) : ["- None recorded"]),
    ``, `WHAT CHILDREN HAVE SAID:`, ...(input.childVoice.length ? input.childVoice.map((v) => `- "${v}"`) : ["- Nothing recorded"]),
    ``, `Write in the voice of an inspection report: "What does the children's home need to do to improve?" (the statutory requirements and recommendations an inspector would make, each citing the regulation), then one section per judgement area with the judgement stated first and 2–3 evidence-led paragraphs, then "The effectiveness of leaders and managers" closing paragraph on oversight. Under 900 words.`,
    ``, `Then, at the very end, output a fenced \`\`\`json block: {"actions":[{"title":string,"owner":"care_worker"|"deputy"|"registered_manager"|"responsible_individual","dueDays":number,"regulation":string}]} — 4 to 10 actions, most important first, each one specific enough to be done and checked.`,
  ].join("\n");
}
