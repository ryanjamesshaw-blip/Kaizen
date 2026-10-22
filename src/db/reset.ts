import "dotenv/config";
import postgres from "postgres";

// Dev only: wipe and rebuild the schema. Refuses to run against anything
// that doesn't look like a local database.
async function main() {
  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL!;
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error("db:reset refuses to run against a non-local database");
  }
  const sql = postgres(url, { max: 1 });
  await sql.unsafe(`DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
  await sql.end();
  console.log("Schema dropped.");
}
main().catch((e) => { console.error(e); process.exit(1); });
