import "dotenv/config";
import postgres from "postgres";
import { computeHash, verifyChain } from "../src/lib/audit/hash";

// Walk the audit chain from the shell. Exit 1 if broken.
const sql = postgres(process.env.DATABASE_URL!);
const rows = await sql`select * from audit_events order by seq`;
const events = rows.map((r) => ({
  seq: Number(r.seq), prevHash: r.prev_hash, hash: r.hash,
  occurredAt: new Date(r.occurred_at).toISOString(), organisationId: r.organisation_id, homeId: r.home_id,
  actorUserId: r.actor_user_id, actorRole: r.actor_role, action: r.action, entityType: r.entity_type, entityId: r.entity_id,
  diff: r.diff, reason: r.reason, ipAddress: r.ip_address, userAgent: r.user_agent,
}));
const broken = verifyChain(events);
if (broken !== null) {
  const e = events.find((x) => x.seq === broken)!;
  const { seq, prevHash, hash, ...content } = e;
  console.log(`BROKEN at #${seq}: stored ${hash.slice(0, 12)} recomputed ${computeHash(prevHash, content).slice(0, 12)}`);
  console.log(JSON.stringify(content));
  process.exit(1);
}
console.log(`Chain intact: ${events.length} events`);
await sql.end();
