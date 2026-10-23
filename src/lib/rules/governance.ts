/** Governance cadence rules. Pure. */
const DAY = 86_400_000;

/** Reg 44(1): the independent person visits at least once a month. */
export function reg44DueOn(lastVisitOn: Date | null, homeCreatedAt: Date): Date {
  const base = lastVisitOn ?? homeCreatedAt;
  // "once a month": due by the end of the following calendar month at the latest; we use 31 days.
  return new Date(base.getTime() + 31 * DAY);
}

/** Reg 45(1): review of quality of care at least once every 6 months. */
export function reg45DueOn(lastPeriodTo: Date | null, homeCreatedAt: Date): Date {
  const base = lastPeriodTo ?? homeCreatedAt;
  return new Date(base.getTime() + 183 * DAY);
}

export type CadenceStatus = "ok" | "due_soon" | "overdue";
export function cadenceStatus(dueOn: Date, now = new Date(), soonDays = 7): CadenceStatus {
  if (now > dueOn) return "overdue";
  if (dueOn.getTime() - now.getTime() < soonDays * DAY) return "due_soon";
  return "ok";
}

export const QUALITY_STANDARDS: Array<{ regulation: number; name: string; prompts: string }> = [
  { regulation: 6, name: "Quality and purpose of care", prompts: "Is the home delivering the Statement of Purpose? Is the environment homely and safe? Are children's needs met?" },
  { regulation: 7, name: "Children's views, wishes and feelings", prompts: "How are children consulted? What has changed because of what they said? Complaints and advocacy?" },
  { regulation: 8, name: "Education", prompts: "Attendance, progress, PEPs, exclusions, NEET; what the home does to support learning." },
  { regulation: 9, name: "Enjoyment and achievement", prompts: "Hobbies, activities, achievements celebrated; access to the community." },
  { regulation: 10, name: "Health and well-being", prompts: "Health assessments, CAMHS, medication management, emotional support, healthy lifestyle." },
  { regulation: 11, name: "Positive relationships", prompts: "Relationships with staff, each other and family; behaviour support; use of restraint and sanctions." },
  { regulation: 12, name: "Protection of children", prompts: "Risk assessments, missing episodes, exploitation, online safety, safeguarding referrals, allegations." },
  { regulation: 13, name: "Leadership and management", prompts: "Staffing, supervision, training, monitoring, Reg 44 actions, notifications, manager oversight." },
  { regulation: 14, name: "Care planning", prompts: "Placement plans, admissions and endings, LAC reviews, transitions, plans actually followed." },
];

export const RATING_LABEL: Record<string, string> = { strong: "Strong", adequate: "Adequate", requires_improvement: "Requires improvement", not_assessed: "Not assessed" };

/** Reg 45 action: split a free-text "recommendations" block into lines. */
export function splitRecommendations(text: string | null | undefined): string[] {
  if (!text) return [];
  return text.split(/\r?\n/).map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim()).filter((l) => l.length > 2);
}
