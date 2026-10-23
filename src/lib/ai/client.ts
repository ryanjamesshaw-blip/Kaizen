import "server-only";
import { createHash } from "node:crypto";

/**
 * One thin door to the model. Everything above this asks for a completion
 * and gets text (plus an optional JSON block); nothing above it knows which
 * provider answered.
 *
 * Boundary (docs/02-architecture.md): prompts contain only the records the
 * calling user is allowed to see; output is stored as a draft; humans sign.
 */
export type Completion = { text: string; json: Record<string, unknown> | null; model: string; inputTokens: number | null; outputTokens: number | null };

export const SYSTEM = `You are an experienced Ofsted social care inspector and registered manager, writing for a children's home in England regulated under the Children's Homes (England) Regulations 2015 and inspected under the SCCIF.
Write in plain British English. Be specific, evidence-based and child-centred. Refer to children by first name only. Never invent facts, dates, names or numbers that are not in the material provided; if something is missing, say it is missing. Where the material shows a problem, say so plainly and say what good practice would look like.`;

export function hashInput(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function isConfigured(): boolean {
  return process.env.AI_PROVIDER === "mock" || !!process.env.ANTHROPIC_API_KEY;
}

export async function complete(user: string, opts: { maxTokens?: number; wantJson?: boolean } = {}): Promise<Completion> {
  if (process.env.AI_PROVIDER === "mock") return mockComplete(user, opts);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("AI is not configured: set ANTHROPIC_API_KEY (or AI_PROVIDER=mock for local testing)");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key });
  const model = process.env.AI_MODEL ?? "claude-sonnet-5-5";
  const res = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 2500,
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const text = res.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");
  return { text: stripJson(text), json: opts.wantJson ? extractJson(text) : null, model: res.model, inputTokens: res.usage?.input_tokens ?? null, outputTokens: res.usage?.output_tokens ?? null };
}

/** The structured part lives in a fenced ```json block at the end. */
export function extractJson(text: string): Record<string, unknown> | null {
  const m = /```json\s*([\s\S]*?)```/.exec(text);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
export function stripJson(text: string): string {
  return text.replace(/```json\s*[\s\S]*?```/g, "").trim();
}

/** Deterministic stand-in so the whole flow can be exercised without a key. */
async function mockComplete(user: string, opts: { wantJson?: boolean }): Promise<Completion> {
  const head = user.split("\n").find((l) => l.startsWith("TASK:")) ?? "TASK: draft";
  const lines = user.split("\n").filter((l) => /^- /.test(l)).slice(0, 6);
  let json: Record<string, unknown> | null = null;
  if (opts.wantJson && /mock inspection/i.test(head)) {
    json = { actions: [
      { title: "Bring every overdue risk assessment review up to date", owner: "deputy", dueDays: 7, regulation: "Reg 12" },
      { title: "Record the outstanding Regulation 40 notifications and their references", owner: "registered_manager", dueDays: 2, regulation: "Reg 40" },
      { title: "Arrange the overdue Regulation 44 visit and copy the report to Ofsted", owner: "responsible_individual", dueDays: 14, regulation: "Reg 44" },
    ] };
  }
  const text = `[MOCK AI OUTPUT — set ANTHROPIC_API_KEY for real drafts]\n\n${head.replace("TASK:", "").trim()}\n\nThe material supplied shows the following points, which this draft addresses in turn:\n${lines.join("\n")}\n\nThis is placeholder narrative generated locally. It demonstrates where the model's writing will appear and how acceptance works; it is not based on judgement.`;
  return { text, json, model: "mock", inputTokens: null, outputTokens: null };
}
