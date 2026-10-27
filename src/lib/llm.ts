import "server-only";
import { z } from "zod";
import { parseStructured } from "./claude";
import type { Settings } from "./settings";

// Default scoring prompt. Edit it in Settings, Scoring. Keep the "Ignore anything outside" sentence: the Regions setting rewrites it.
export const SYSTEM_PROMPT =
  'You are a talent agent for a performer whose profile appears in the About block that comes with each notice. Score how well the notice fits that profile. Read the following casting/funding notice. Does it fit her profile? Score it from 1 to 10. Ignore anything outside the UK unless it\'s a major EU grant. Return ONLY a JSON object with this exact structure: { "is_match": boolean (true if score >= 7), "score": number, "role_title": string, "company": string, "match_reason": string (1 sentence explaining why) }.';

// Structured outputs guarantee this shape; the clamp guards against a 0 or 11.
const MatchSchema = z.object({
  is_match: z.boolean(),
  score: z.number(),
  role_title: z.string(),
  company: z.string(),
  match_reason: z.string(),
});

export type MatchResult = z.infer<typeof MatchSchema>;

// Notices are short; this only stops a giant newsletter running up the bill.
const MAX_INPUT_CHARS = 20_000;

// `about` is what the agent has learned about the client (profile_facts). It goes in the
// user turn ahead of the notice, so the fixed system prompt stays untouched.
export async function scoreNotice(text: string, about: string, systemPrompt: string, st: Settings): Promise<MatchResult> {
  const notice = text.slice(0, MAX_INPUT_CHARS);
  const content = about ? `${about}\n\n--- Notice to score ---\n${notice}` : notice;
  const result = await parseStructured({
    st,
    tier: "light",
    feature: "scoring",
    maxTokens: 4000,
    system: systemPrompt,
    messages: [{ role: "user", content }],
    schema: MatchSchema,
  });
  return { ...result, score: Math.min(10, Math.max(1, Math.round(result.score))) };
}

// Plain-English message for an API failure that the owner can act on.
export function friendlyApiError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/usage limits?/i.test(msg)) {
    return "The monthly Claude spending limit has been reached, so chat, scoring and research are paused. Raise the limit at console.anthropic.com (Settings, Limits) to carry on.";
  }
  if (/credit balance/i.test(msg)) {
    return "The Claude account is out of credit. Add credit at console.anthropic.com (Billing) to carry on.";
  }
  return msg;
}
