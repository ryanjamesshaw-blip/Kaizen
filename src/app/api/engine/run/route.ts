import { runEngineForAll } from "@/lib/engine/run";

/**
 * Scheduled trigger. Call hourly from the hosting platform's cron with
 *   Authorization: Bearer $ENGINE_SECRET
 */
export async function POST(req: Request) {
  const secret = process.env.ENGINE_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorised", { status: 401 });
  const results = await runEngineForAll();
  return Response.json({ ran: results.length, results: results.map((r) => ({ homeId: r.homeId, score: r.score, durationMs: r.durationMs })) });
}
