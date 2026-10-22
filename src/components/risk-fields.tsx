import { Area, DateInput, Select, Text } from "@/components/form";
import type { RiskAssessment } from "@/db/schema";

export const RISK_TYPES: Array<[string, string]> = [["general", "General"], ["missing", "Missing from home"], ["self_harm", "Self-harm"], ["online", "Online safety"], ["exploitation", "Exploitation (CSE / CCE)"], ["substance", "Substance use"], ["behaviour", "Behaviour"], ["health", "Health"], ["activity", "Activity / trip"], ["other", "Other"]];
export const RISK_TYPE_LABEL = Object.fromEntries(RISK_TYPES);
const LEVELS: Array<[string, string]> = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["very_high", "Very high"]];

function plusDays(d: number) { const x = new Date(); x.setDate(x.getDate() + d); return x; }

export function RiskFields({ r }: { r?: Partial<RiskAssessment> }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Text name="title" label="Title" defaultValue={r?.title} required placeholder="e.g. Risk of going missing after contact" />
        <Select name="type" label="Type" defaultValue={r?.type} options={RISK_TYPES} />
        <Select name="level" label="Current risk level" defaultValue={r?.level} options={LEVELS} />
        <DateInput name="reviewDueOn" label="Review due" defaultValue={r?.reviewDueOn ?? plusDays(28)} required hint="Default 4 weeks; shorter for high risk" />
      </div>
      <Area name="description" label="Description of the risk" defaultValue={r?.description} rows={3} />
      <Area name="triggers" label="Known triggers and early warning signs" defaultValue={r?.triggers} rows={3} />
      <Area name="controls" label="Control measures and how staff should respond" defaultValue={r?.controls} rows={5} />
      <Area name="childsViews" label="Child's views on this assessment" defaultValue={r?.childsViews} rows={2} hint="Regulation 7 — the child's wishes and feelings" />
    </>
  );
}
