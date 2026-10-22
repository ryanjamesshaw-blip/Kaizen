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

  await client.end();
  console.log(`Seeded ${people.length} users across 2 homes. Password for all: ${DEMO_PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
