import { Area, DateInput, Section, Select, Text } from "@/components/form";
import { ContactsEditor } from "@/components/contacts-editor";
import type { Child } from "@/db/schema";

const SEX: Array<[string, string]> = [["not_recorded", "Not recorded"], ["female", "Female"], ["male", "Male"], ["other", "Other"]];
export const LEGAL: Array<[string, string]> = [
  ["not_recorded", "Not recorded"],
  ["s20", "Section 20 — accommodated"],
  ["s31", "Section 31 — full care order"],
  ["s38", "Section 38 — interim care order"],
  ["s25", "Section 25 — secure accommodation"],
  ["remand", "Remand to local authority"],
  ["placed_for_adoption", "Placed for adoption"],
  ["other", "Other"],
];
export const LEGAL_LABEL = Object.fromEntries(LEGAL);

/** Schedule 3 field groups. Server component — the contacts editor inside is a client island. */
export function ChildFields({ c, staff }: { c?: Partial<Child>; staff: Array<{ id: string; fullName: string }> }) {
  return (
    <>
      <Section title="Personal details" description="Schedule 3, paragraphs 1–4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Text name="firstName" label="First name" defaultValue={c?.firstName} required />
          <Text name="lastName" label="Last name" defaultValue={c?.lastName} required />
          <Text name="preferredName" label="Known as" defaultValue={c?.preferredName} />
          <DateInput name="dateOfBirth" label="Date of birth" defaultValue={c?.dateOfBirth ?? null} required />
          <Select name="sex" label="Sex" defaultValue={c?.sex} options={SEX} />
          <Text name="religion" label="Religion" defaultValue={c?.religion} />
          <Text name="ethnicity" label="Ethnicity" defaultValue={c?.ethnicity} />
          <Text name="firstLanguage" label="First language" defaultValue={c?.firstLanguage} />
          <Text name="nhsNumber" label="NHS number" defaultValue={c?.nhsNumber} />
          <Text name="uniquePupilNumber" label="Unique pupil number" defaultValue={c?.uniquePupilNumber} />
        </div>
        <Area name="culturalBackground" label="Cultural and linguistic background" defaultValue={c?.culturalBackground} rows={2} />
        <Area name="addressBeforeAdmission" label="Address immediately before admission" defaultValue={c?.addressBeforeAdmission} rows={2} hint="Schedule 3, paragraph 5" />
      </Section>

      <Section title="Legal status and placing authority" description="Schedule 3, paragraph 8">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select name="legalStatus" label="Legal status" defaultValue={c?.legalStatus} options={LEGAL} />
          <Text name="legalStatusDetail" label="Detail (order dates, court)" defaultValue={c?.legalStatusDetail} />
          <Text name="placingAuthority" label="Placing authority" defaultValue={c?.placingAuthority} />
          <Text name="placingAuthorityRef" label="Placing authority reference" defaultValue={c?.placingAuthorityRef} />
        </div>
      </Section>

      <Section title="People involved" description="Schedule 3, paragraphs 9–11: parents and carers, social worker, IRO, health professionals, school contacts">
        <ContactsEditor initial={(c?.contacts as Child["contacts"]) ?? []} />
      </Section>

      <Section title="Education and employment" description="Schedule 3, paragraphs 12–13">
        <div className="grid gap-4 sm:grid-cols-2">
          <Text name="educationProvider" label="School / college / provider" defaultValue={c?.educationProvider} />
          <Text name="educationProviderContact" label="Provider contact details" defaultValue={c?.educationProviderContact} />
          <Text name="yearGroup" label="Year group" defaultValue={c?.yearGroup} />
          <Text name="employer" label="Employer (if any)" defaultValue={c?.employer} />
        </div>
      </Section>

      <Section title="Contact" description="Schedule 3, paragraph 16">
        <Area name="contactArrangements" label="Contact arrangements" defaultValue={c?.contactArrangements} />
        <Area name="contactRestrictions" label="Restrictions on contact" defaultValue={c?.contactRestrictions} rows={2} />
      </Section>

      <Section title="Health" description="Schedule 3, paragraphs 21–26">
        <div className="grid gap-4 sm:grid-cols-3">
          <Text name="gpDetails" label="GP" defaultValue={c?.gpDetails} />
          <Text name="dentistDetails" label="Dentist" defaultValue={c?.dentistDetails} />
          <Text name="opticianDetails" label="Optician" defaultValue={c?.opticianDetails} />
        </div>
        <Area name="healthConditions" label="Health conditions" defaultValue={c?.healthConditions} rows={2} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Area name="allergies" label="Allergies" defaultValue={c?.allergies} rows={2} />
          <Area name="dietaryNeeds" label="Dietary needs" defaultValue={c?.dietaryNeeds} rows={2} />
        </div>
        <Area name="immunisations" label="Immunisations" defaultValue={c?.immunisations} rows={2} />
        <Area name="disabilitiesAndNeeds" label="Disabilities and additional needs" defaultValue={c?.disabilitiesAndNeeds} rows={2} />
      </Section>

      <Section title="Home">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select name="keyWorkerUserId" label="Key worker" defaultValue={c?.keyWorkerUserId ?? ""} options={[["", "— Not assigned —"], ...staff.map((s): [string, string] => [s.id, s.fullName])]} />
        </div>
        <Area name="notes" label="Notes" defaultValue={c?.notes} rows={2} />
      </Section>
    </>
  );
}
