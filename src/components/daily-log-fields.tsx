import { Area, DateInput, Select, Text } from "@/components/form";
import type { DailyLog } from "@/db/schema";

export const SHIFTS: Array<[string, string]> = [["early", "Early"], ["late", "Late"], ["night", "Night"], ["day", "Day"]];
export const SHIFT_LABEL = Object.fromEntries(SHIFTS);
export const MOODS: Array<[string, string]> = [["settled", "Settled"], ["happy", "Happy"], ["anxious", "Anxious"], ["low", "Low"], ["angry", "Angry"], ["mixed", "Mixed"], ["not_seen", "Not seen this shift"]];
export const MOOD_LABEL = Object.fromEntries(MOODS);

function Tri({ name, label, value }: { name: string; label: string; value: boolean | null | undefined }) {
  const v = value === true ? "yes" : value === false ? "no" : "";
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex gap-4 text-sm">
        {[["yes", "Yes"], ["no", "No"], ["", "N/A"]].map(([val, l]) => (
          <label key={val} className="flex items-center gap-1"><input type="radio" name={name} value={val} defaultChecked={v === val} />{l}</label>
        ))}
      </div>
    </fieldset>
  );
}

export function DailyLogFields({ l, date, shift }: { l?: Partial<DailyLog>; date?: Date; shift?: string }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <DateInput name="logDate" label="Date" defaultValue={l?.logDate ?? date ?? new Date()} required />
        <Select name="shift" label="Shift" defaultValue={l?.shift ?? shift} options={SHIFTS} />
        <Select name="mood" label="Overall mood" defaultValue={l?.mood} options={MOODS} />
      </div>
      <Area name="narrative" label="How the shift went" defaultValue={l?.narrative} rows={5} required hint="Write it as you would want the child to read it one day. What happened, what you did, how they responded." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Area name="positives" label="Positives and achievements" defaultValue={l?.positives} rows={2} />
        <Area name="concerns" label="Concerns" defaultValue={l?.concerns} rows={2} hint="Anything a manager should see. Incidents are recorded separately." />
      </div>
      <details className="rounded-md border border-line p-3" open={!!(l?.educationNotes || l?.meals || l?.activities || l?.contactWithFamily || l?.healthNotes || l?.bedtime || l?.sleep)}>
        <summary className="cursor-pointer text-sm font-medium">Prompts — education, meals, activities, contact, health, sleep</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Tri name="attendedEducation" label="Attended education" value={l?.attendedEducation} />
          <Text name="educationNotes" label="Education notes" defaultValue={l?.educationNotes} />
          <Text name="meals" label="Meals" defaultValue={l?.meals} placeholder="Breakfast / lunch / dinner" />
          <Text name="activities" label="Activities" defaultValue={l?.activities} />
          <Text name="contactWithFamily" label="Contact with family / friends" defaultValue={l?.contactWithFamily} />
          <Text name="healthNotes" label="Health" defaultValue={l?.healthNotes} />
          <Tri name="medicationGiven" label="Medication given (see MAR)" value={l?.medicationGiven} />
          <Text name="bedtime" label="Bedtime" defaultValue={l?.bedtime} placeholder="e.g. 21:45, settled by 22:10" />
          <Text name="sleep" label="Sleep (night shift)" defaultValue={l?.sleep} />
        </div>
      </details>
    </>
  );
}
