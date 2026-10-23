import "dotenv/config";
// Run the audit engine for every active home. Schedule this hourly in production.
const { runEngineForAll } = await import("../src/lib/engine/run");
const results = await runEngineForAll();
for (const r of results) console.log(`${r.homeId} score ${r.score} (${r.durationMs} ms)`, JSON.stringify(Object.fromEntries(Object.entries(r.summary).filter(([, v]) => v.findings || v.created || v.resolved || v.escalated))));
process.exit(0);
