import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import * as schema from "./schema";

/**
 * Demo data. All names fictional. Every role has a login so each screen can
 * be tried from each perspective. Password for everyone: Kaizen-demo-1
 */
const DEMO_PASSWORD = "Kaizen-demo-1";

async function main() {
  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL!;
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  const existing = await db.select({ id: schema.organisations.id }).from(schema.organisations).limit(1);
  if (existing.length) {
    console.log("Already seeded — run db:reset to start again.");
    await client.end();
    return;
  }

  const [org] = await db
    .insert(schema.organisations)
    .values({ name: "Brightwater Care Ltd", companyNumber: "12345678" })
    .returning();

  const [oak, willow] = await db
    .insert(schema.homes)
    .values([
      {
        organisationId: org.id,
        name: "Oak House",
        ofstedUrn: "SC000001",
        addressLine1: "14 Mill Lane",
        town: "Chesterfield",
        postcode: "S40 1AA",
        capacity: 4,
        ageRangeMin: 8,
        ageRangeMax: 17,
      },
      {
        organisationId: org.id,
        name: "Willow Lodge",
        ofstedUrn: "SC000002",
        addressLine1: "3 Station Road",
        town: "Mansfield",
        postcode: "NG18 1BB",
        capacity: 3,
        ageRangeMin: 11,
        ageRangeMax: 17,
      },
    ])
    .returning();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const people: Array<{ email: string; fullName: string; role: schema.Role; home?: typeof oak; days?: number }> = [
    { email: "director@demo.kaizen", fullName: "Margaret Ellis", role: "director" },
    { email: "ri@demo.kaizen", fullName: "David Okafor", role: "responsible_individual" },
    { email: "admin@demo.kaizen", fullName: "Priya Nair", role: "system_admin" },
    { email: "rm.oak@demo.kaizen", fullName: "Sarah Whitfield", role: "registered_manager", home: oak },
    { email: "deputy.oak@demo.kaizen", fullName: "Tom Barnes", role: "deputy", home: oak },
    { email: "cw1.oak@demo.kaizen", fullName: "Aisha Rahman", role: "care_worker", home: oak },
    { email: "cw2.oak@demo.kaizen", fullName: "Liam Doyle", role: "care_worker", home: oak },
    { email: "rm.willow@demo.kaizen", fullName: "James Carter", role: "registered_manager", home: willow },
    { email: "cw1.willow@demo.kaizen", fullName: "Chloe Nolan", role: "care_worker", home: willow },
    { email: "reg44@demo.kaizen", fullName: "Helen Moss", role: "independent_visitor", home: oak, days: 365 },
    { email: "inspector@demo.kaizen", fullName: "Ofsted Inspector", role: "inspector", home: oak, days: 14 },
  ];

  const [director] = await db
    .insert(schema.users)
    .values({ email: people[0].email, fullName: people[0].fullName, passwordHash })
    .returning();

  await db.insert(schema.memberships).values({
    userId: director.id,
    organisationId: org.id,
    role: "director",
    grantedBy: director.id,
  });

  for (const p of people.slice(1)) {
    const [u] = await db.insert(schema.users).values({ email: p.email, fullName: p.fullName, passwordHash }).returning();
    await db.insert(schema.memberships).values({
      userId: u.id,
      organisationId: org.id,
      homeId: p.home?.id ?? null,
      role: p.role,
      grantedBy: director.id,
      validTo: p.days ? new Date(Date.now() + p.days * 86_400_000) : null,
    });
  }

  // ---- Children (fictional) ----
  const byEmail = Object.fromEntries((await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users)).map((u) => [u.email, u.id]));
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const daysAgo = (n: number) => { const x = new Date(); x.setUTCDate(x.getUTCDate() - n); x.setUTCHours(0, 0, 0, 0); return x; };
  const inDays = (n: number) => daysAgo(-n);

  const kids = [
    {
      home: oak, firstName: "Kayden", lastName: "Price", preferredName: "Kay", dateOfBirth: d("2011-03-14"), sex: "male" as const,
      legalStatus: "s31" as const, placingAuthority: "Derbyshire County Council", placingAuthorityRef: "DCC-44821", religion: "None", ethnicity: "White British", firstLanguage: "English",
      educationProvider: "Hasland Hall Community School", yearGroup: "Year 10", gpDetails: "Dr Patel, Mill Lane Surgery, 01246 000000", allergies: "Penicillin", dietaryNeeds: null,
      contactArrangements: "Supervised contact with mother fortnightly at the family centre.", keyWorkerUserId: byEmail["cw1.oak@demo.kaizen"], admitted: daysAgo(140), emergency: false,
      contacts: [
        { role: "Mother", name: "Donna Price", phone: "07700 900001", parentalResponsibility: true },
        { role: "Social worker", name: "Amara Osei", organisation: "Derbyshire CC", phone: "01629 000000", email: "a.osei@example.gov.uk" },
        { role: "IRO", name: "Peter Hale", organisation: "Derbyshire CC" },
      ],
      risks: [
        { type: "missing" as const, title: "Going missing after contact visits", level: "high" as const, status: "locked" as const, reviewDueOn: daysAgo(3), triggers: "Contact with mother being cancelled or cut short; conflict with peers.", controls: "Staff to debrief after every contact. If not back by 21:00 follow missing policy; police informed at 60 minutes. Return interview within 24h.", childsViews: "\"I just need some space. I always come back.\"" },
        { type: "online" as const, title: "Unsupervised online contact", level: "medium" as const, status: "submitted" as const, reviewDueOn: inDays(20), controls: "Device handed in at 22:00. Parental controls on home Wi-Fi. Weekly key-work on online safety." },
      ],
      chrono: [
        [daysAgo(120), "review", "First LAC review — placement agreed as long term", true],
        [daysAgo(45), "missing", "Missing 19:40–23:10; found at friend's house; return interview completed", true],
        [daysAgo(10), "achievement", "Selected for school football team", false],
      ],
      plan: true,
    },
    {
      home: oak, firstName: "Amelia", lastName: "Farrow", preferredName: null, dateOfBirth: d("2009-11-02"), sex: "female" as const,
      legalStatus: "s20" as const, placingAuthority: "Nottingham City Council", placingAuthorityRef: "NCC-10377", religion: "Christian", ethnicity: "Black Caribbean", firstLanguage: "English",
      educationProvider: "Chesterfield College (Health & Social Care L2)", yearGroup: "Year 12", gpDetails: "Dr Khan, Mill Lane Surgery", allergies: null, dietaryNeeds: "Vegetarian",
      contactArrangements: "Unsupervised contact with grandmother weekly.", keyWorkerUserId: byEmail["cw1.oak@demo.kaizen"], admitted: daysAgo(400), emergency: false,
      contacts: [
        { role: "Carer / guardian", name: "Beverley Farrow (grandmother)", phone: "07700 900002", parentalResponsibility: false },
        { role: "Social worker", name: "Tom Reilly", organisation: "Nottingham City Council" },
      ],
      risks: [
        { type: "self_harm" as const, title: "Low mood and historic self-harm", level: "medium" as const, status: "locked" as const, reviewDueOn: inDays(12), controls: "Weekly CAMHS. Sharps stored securely. Staff check-in at bedtime. Safety plan on file.", childsViews: "Amelia says things are \"much better than last year\" and wants the plan kept in place." },
      ],
      chrono: [
        [daysAgo(380), "health", "Referred to CAMHS", true],
        [daysAgo(60), "education", "Started college placement", true],
      ],
      plan: true,
    },
    {
      home: oak, firstName: "Riley", lastName: "Okonkwo", preferredName: null, dateOfBirth: d("2013-06-21"), sex: "male" as const,
      legalStatus: "s38" as const, placingAuthority: "Sheffield City Council", placingAuthorityRef: null, religion: null, ethnicity: "Mixed — White and Black African", firstLanguage: "English",
      educationProvider: "Not yet in school — awaiting placement", yearGroup: null, gpDetails: null, allergies: "Nuts (carries EpiPen)", dietaryNeeds: "Nut-free",
      contactArrangements: null, keyWorkerUserId: null, admitted: daysAgo(4), emergency: true,
      contacts: [{ role: "Social worker", name: "Hannah Blake", organisation: "Sheffield CC", phone: "0114 000 0000" }],
      risks: [],
      chrono: [],
      plan: false,
    },
    {
      home: willow, firstName: "Jasmine", lastName: "Cole", preferredName: "Jas", dateOfBirth: d("2010-01-30"), sex: "female" as const,
      legalStatus: "s31" as const, placingAuthority: "Nottinghamshire County Council", placingAuthorityRef: "NOTTS-77120", religion: "Muslim", ethnicity: "Asian British — Pakistani", firstLanguage: "English (Urdu at home)",
      educationProvider: "The Manor Academy", yearGroup: "Year 11", gpDetails: "Dr Evans, Station Road Practice", allergies: null, dietaryNeeds: "Halal",
      contactArrangements: "Letterbox contact with father.", keyWorkerUserId: byEmail["cw1.willow@demo.kaizen"], admitted: daysAgo(210), emergency: false,
      contacts: [{ role: "Social worker", name: "Grace Mitchell", organisation: "Nottinghamshire CC" }],
      risks: [{ type: "exploitation" as const, title: "Contact from unknown older males online", level: "high" as const, status: "reviewed" as const, reviewDueOn: inDays(7), controls: "Phone checked nightly with Jasmine present. Referral to CCE panel made. Named police contact." }],
      chrono: [[daysAgo(30), "safeguarding", "Referral to exploitation panel", true]],
      plan: true,
    },
  ];

  for (const k of kids) {
    const { home, admitted, emergency, risks, chrono, plan, contacts, ...fields } = k;
    const rm = home.id === oak.id ? byEmail["rm.oak@demo.kaizen"] : byEmail["rm.willow@demo.kaizen"];
    const cw = home.id === oak.id ? byEmail["cw1.oak@demo.kaizen"] : byEmail["cw1.willow@demo.kaizen"];
    const [c] = await db.insert(schema.children).values({ ...fields, contacts, organisationId: org.id, homeId: home.id, createdBy: rm, updatedBy: rm }).returning();
    const [p] = await db.insert(schema.placements).values({ organisationId: org.id, homeId: home.id, childId: c.id, admittedOn: admitted, emergency, reasonForPlacement: emergency ? "Emergency placement following family breakdown" : "Planned move from foster care", createdBy: rm, updatedBy: rm }).returning();
    await db.insert(schema.chronologyEntries).values({ organisationId: org.id, homeId: home.id, childId: c.id, occurredOn: admitted, category: "placement", summary: `Admitted to ${home.name}${emergency ? " (emergency placement)" : ""}`, significant: true, sourceType: "placement", sourceId: p.id, createdBy: rm });
    for (const [occurredOn, category, summary, significant] of chrono) {
      await db.insert(schema.chronologyEntries).values({ organisationId: org.id, homeId: home.id, childId: c.id, occurredOn: occurredOn as Date, category: category as never, summary: summary as string, significant: significant as boolean, createdBy: cw });
    }
    for (const r of risks) {
      const stamps = r.status === "locked" ? { submittedAt: daysAgo(30), submittedBy: cw, reviewedAt: daysAgo(29), reviewedBy: rm, lockedAt: daysAgo(29), lockedBy: rm }
        : r.status === "reviewed" ? { submittedAt: daysAgo(5), submittedBy: cw, reviewedAt: daysAgo(4), reviewedBy: rm }
        : r.status === "submitted" ? { submittedAt: daysAgo(2), submittedBy: cw } : {};
      await db.insert(schema.riskAssessments).values({ ...r, ...stamps, organisationId: org.id, homeId: home.id, childId: c.id, createdBy: cw, updatedBy: cw, description: r.title });
    }
    if (plan) {
      await db.insert(schema.placementPlans).values({
        organisationId: org.id, homeId: home.id, childId: c.id, placementId: p.id, status: "locked", version: 1,
        needsAndObjectives: "A stable, nurturing placement that supports education and family relationships.",
        healthArrangements: "Registered with local GP and dentist. Annual health assessment due.", educationArrangements: `Attends ${fields.educationProvider}. Transport by staff.`,
        contactArrangements: fields.contactArrangements, behaviourSupport: "Relational, trauma-informed approach. No physical intervention unless there is an immediate risk of serious harm.",
        independenceSkills: "Cooking one meal a week; managing a weekly allowance.", culturalReligiousNeeds: fields.religion ? `Supported to practise ${fields.religion} faith.` : "No specific needs identified.",
        childsViews: "Happy with the plan; wants more say over weekend activities.", reviewDueOn: inDays(45),
        submittedAt: daysAgo(100), submittedBy: cw, reviewedAt: daysAgo(99), reviewedBy: rm, lockedAt: daysAgo(99), lockedBy: rm, createdBy: cw, updatedBy: cw,
      });
    }
  }

  // ---- Daily recording (last 5 days) ----
  const placed = await db.select({ id: schema.children.id, homeId: schema.children.homeId, firstName: schema.children.firstName }).from(schema.children);
  const narratives = [
    "A settled shift. Up on time, ate breakfast with the group and went to school without any fuss. Spent the evening on the Xbox with Tom and was in bed by 21:45.",
    "Quiet start, a bit low after a phone call with family. Talked it through on the walk to the shop; by tea time was laughing with the others. Helped cook pasta.",
    "Refused school in the morning and stayed in bed until 10. Staff gave space then sat with them; agreed to go in for the afternoon. Good evening — football in the garden.",
    "Busy day: dentist at 11 (no treatment needed), then swimming. Tired by evening, asked for an early night.",
    "Unsettled at bedtime, worried about a test tomorrow. Staff sat outside the room until asleep around 23:20.",
  ];
  const moods = ["settled", "low", "mixed", "happy", "anxious"] as const;
  for (const c of placed) {
    const cwId = c.homeId === oak.id ? byEmail["cw1.oak@demo.kaizen"] : byEmail["cw1.willow@demo.kaizen"];
    const rmId = c.homeId === oak.id ? byEmail["rm.oak@demo.kaizen"] : byEmail["rm.willow@demo.kaizen"];
    for (let i = 1; i <= 5; i++) {
      if (c.firstName === "Riley" && i > 3) continue; // admitted 4 days ago
      const d = daysAgo(i);
      const status = i >= 3 ? "locked" : i === 2 ? "submitted" : "draft";
      const stamps = status === "locked" ? { submittedAt: d, submittedBy: cwId, reviewedAt: d, reviewedBy: rmId, lockedAt: d, lockedBy: rmId } : status === "submitted" ? { submittedAt: d, submittedBy: cwId } : {};
      await db.insert(schema.dailyLogs).values({
        organisationId: org.id, homeId: c.homeId, childId: c.id, logDate: d, shift: "late", mood: moods[(i + c.firstName.length) % 5],
        narrative: narratives[(i + c.firstName.length) % 5], attendedEducation: i !== 3, meals: "Breakfast, packed lunch, pasta for tea", bedtime: "21:45",
        concerns: i === 2 && c.firstName === "Kayden" ? "Mentioned an older lad at the park offering him vapes." : null,
        status, ...stamps, createdBy: cwId, updatedBy: cwId,
      });
    }
    if (c.firstName !== "Riley") {
      await db.insert(schema.keyworkSessions).values({
        organisationId: org.id, homeId: c.homeId, childId: c.id, sessionDate: daysAgo(9), durationMinutes: 40,
        topics: "Contact, school, saving for a bike", discussion: "Talked about how contact is going and what would make school easier. Agreed to ask the teacher about a quiet space at lunch.",
        childsWords: "I want to see my nan more. School is alright when people leave me alone.", actionsAgreed: "Key worker to ask SW about extra contact (by Friday). Staff to help open a savings jar.",
        nextSessionOn: inDays(5), status: "locked", submittedAt: daysAgo(9), submittedBy: cwId, reviewedAt: daysAgo(8), reviewedBy: rmId, lockedAt: daysAgo(8), lockedBy: rmId, createdBy: cwId, updatedBy: cwId,
      });
      await db.insert(schema.childVoice).values([
        { organisationId: org.id, homeId: c.homeId, childId: c.id, recordedOn: daysAgo(9), method: "keywork", whatTheChildSaid: "I want to see my nan more. School is alright when people leave me alone.", response: "Key worker to ask SW about extra contact.", outcome: "SW agreed an extra fortnightly visit from next month.", respondedBy: rmId, respondedAt: daysAgo(6), createdBy: cwId },
        { organisationId: org.id, homeId: c.homeId, childId: c.id, recordedOn: daysAgo(2), method: "house_meeting", whatTheChildSaid: "Can we have pizza night on Fridays instead of Saturdays?", response: "Will raise at team meeting.", createdBy: cwId },
      ]);
    }
  }
  for (const h of [oak, willow]) {
    const cwId = h.id === oak.id ? byEmail["cw1.oak@demo.kaizen"] : byEmail["cw1.willow@demo.kaizen"];
    const hk = placed.filter((c) => c.homeId === h.id);
    await db.insert(schema.handovers).values({
      organisationId: org.id, homeId: h.id, handoverDate: daysAgo(1), fromShift: "late", toShift: "night",
      childNotes: hk.map((c) => ({ childId: c.id, note: `${c.firstName} settled by 22:00; nothing outstanding.` })),
      homeNotes: "Boiler engineer booked for Thursday 10am. Petty cash tin £142.30.", tasksCarriedForward: "Chase school re: transport letter.", staffOnDuty: "Night: Liam", createdBy: cwId, updatedBy: cwId,
    });
  }

  await client.end();
  console.log(`Seeded ${people.length} users, 2 homes, ${kids.length} children with daily records. Password for all: ${DEMO_PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
