import { Area, DateInput } from "@/components/form";
import type { PlacementPlan } from "@/db/schema";

function plusDays(d: number) { const x = new Date(); x.setDate(x.getDate() + d); return x; }

/** Regulation 17 placement plan headings. */
export const PLAN_SECTIONS: Array<[keyof PlacementPlan, string, string]> = [
  ["needsAndObjectives", "Needs and objectives of the placement", "What the placement is for and what it should achieve"],
  ["healthArrangements", "Health", "Appointments, medication, emotional wellbeing support"],
  ["educationArrangements", "Education and training", "School/college, transport, PEP targets"],
  ["contactArrangements", "Contact with family and friends", "Who, how often, supervised or not"],
  ["behaviourSupport", "Behaviour support", "Approach, de-escalation, agreed sanctions, restraint position"],
  ["independenceSkills", "Independence and life skills", "Age-appropriate skills and goals"],
  ["culturalReligiousNeeds", "Cultural, linguistic and religious needs", "How these are supported"],
  ["childsViews", "Child's views on the plan", "In their words where possible"],
];

export function PlanFields({ p }: { p?: Partial<PlacementPlan> }) {
  return (
    <>
      {PLAN_SECTIONS.map(([k, label, hint]) => (
        <Area key={k} name={k} label={label} hint={hint} defaultValue={(p?.[k] as string | null | undefined) ?? ""} rows={3} />
      ))}
      <DateInput name="reviewDueOn" label="Review due" defaultValue={p?.reviewDueOn ?? plusDays(28)} hint="Reviewed at least at every LAC review" />
    </>
  );
}
