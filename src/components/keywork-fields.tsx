import { Area, DateInput, Text } from "@/components/form";
import type { KeyworkSession } from "@/db/schema";

export function KeyworkFields({ k }: { k?: Partial<KeyworkSession> }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <DateInput name="sessionDate" label="Date" defaultValue={k?.sessionDate ?? new Date()} required />
        <Text name="durationMinutes" label="Duration (minutes)" type="number" defaultValue={k?.durationMinutes?.toString()} />
        <DateInput name="nextSessionOn" label="Next session" defaultValue={k?.nextSessionOn ?? null} />
      </div>
      <Text name="topics" label="Topics" defaultValue={k?.topics} required placeholder="e.g. contact with mum, school, saving for a bike" />
      <Area name="discussion" label="What was discussed" defaultValue={k?.discussion} rows={5} required />
      <Area name="childsWords" label="In the child's own words" defaultValue={k?.childsWords} rows={2} hint="Also recorded under Child's voice (Reg 7)" />
      <Area name="actionsAgreed" label="Actions agreed — who does what, by when" defaultValue={k?.actionsAgreed} rows={3} />
    </>
  );
}
