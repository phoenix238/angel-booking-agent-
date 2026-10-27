import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { Settings } from "./settings";
import { createAdminClient } from "./supabase/admin";

// The one place the app talks to Claude. It picks the model for each job from Settings,
// logs what every call cost, and refuses to start new work once the monthly cap is reached.

export type Tier = "light" | "chat" | "research";

let client: Anthropic | null = null;
export function anthropic() {
  client ??= new Anthropic();
  return client;
}

// ---- Prices (USD per million tokens), from Anthropic's pricing page -------------------
type Price = { in: number; out: number; cacheRead: number; cacheWrite: number };
const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }, // prompts up to 100K tokens
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
};
const HAIKU_LONG: Price = { in: 0.5, out: 2.5, cacheRead: 0.05, cacheWrite: 0.625 }; // prompts over 100K tokens
const SEARCH_COST = 10 / 1000; // $10 per 1,000 web searches, on top of tokens

export type Usage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

export function costOf(model: string, u: Usage): number {
  // Unknown models are priced like Opus, so the meter errs on the high side.
  let p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const input = u.input_tokens ?? 0;
  if (model === "claude-haiku-5-5" && input > 100_000) p = HAIKU_LONG;
  return (
    (input * p.in + (u.output_tokens ?? 0) * p.out + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1_000_000 +
    (u.server_tool_use?.web_search_requests ?? 0) * SEARCH_COST
  );
}

// ---- Spend meter and cap ---------------------------------------------------------------
export class BudgetError extends Error {}

const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
let spendCache: { month: string; spent: number; at: number } | null = null;

export async function monthSpend(force = false): Promise<number> {
  const month = monthStart();
  if (!force && spendCache && spendCache.month === month && Date.now() - spendCache.at < 30_000) return spendCache.spent;
  const { data } = await createAdminClient().from("usage_log").select("cost_usd").gte("at", month).limit(50_000);
  const spent = (data ?? []).reduce((n, r) => n + Number(r.cost_usd), 0);
  spendCache = { month, spent, at: Date.now() };
  return spent;
}

export async function assertBudget(st: Settings): Promise<void> {
  const cap = st.budget.monthlyCapUsd;
  if (!cap) return;
  const spent = await monthSpend();
  if (spent >= cap) {
    throw new BudgetError(
      `The monthly cost cap of $${cap.toFixed(2)} has been reached ($${spent.toFixed(2)} spent this month), so new Claude work is paused. Raise the cap in Settings, Costs, to carry on.`,
    );
  }
}

async function logUsage(feature: string, model: string, usage: Usage | undefined | null) {
  if (!usage) return;
  const cost = costOf(model, usage);
  if (spendCache) spendCache.spent += cost;
  try {
    await createAdminClient().from("usage_log").insert({
      feature,
      model,
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_read: usage.cache_read_input_tokens ?? 0,
      cache_write: usage.cache_creation_input_tokens ?? 0,
      searches: usage.server_tool_use?.web_search_requests ?? 0,
      cost_usd: cost.toFixed(5),
    });
  } catch (e) {
    console.error("[usage] could not log", feature, e instanceof Error ? e.message : e);
  }
}

// ---- Calls ---------------------------------------------------------------------------------
// Only these models accept the server-side refusal fallback; Haiku 5.5 does not.
const SUPPORTS_FALLBACK = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

// One structured (JSON schema) reply. The model comes from Settings by tier.
export async function parseStructured<S extends z.ZodType>(args: {
  st: Settings;
  tier: Tier;
  feature: string;
  system?: string;
  messages: Anthropic.MessageParam[];
  schema: S;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}): Promise<z.infer<S>> {
  await assertBudget(args.st);
  const model = args.st.models[args.tier];
  const common = {
    model,
    max_tokens: args.maxTokens ?? 8000,
    ...(args.system ? { system: args.system } : {}),
    messages: args.messages,
    output_config: { effort: args.effort ?? "low", format: zodOutputFormat(args.schema) },
  };
  const response = SUPPORTS_FALLBACK.has(model)
    ? await anthropic().beta.messages.parse({ ...common, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
    : await anthropic().messages.parse(common);
  await logUsage(args.feature, response.model ?? model, response.usage as Usage);
  if (response.stop_reason === "refusal") throw new Error("Claude declined this request.");
  if (!response.parsed_output) throw new Error(`No usable reply (stop reason: ${response.stop_reason})`);
  return response.parsed_output as z.infer<S>;
}

const MAX_PAUSE_RESUMES = 3;

// Claude web research with server-side search; returns the final write-up text.
export async function webResearch(st: Settings, prompt: string, maxUses = 12, feature = "research"): Promise<string> {
  await assertBudget(st);
  const model = st.models.research;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  for (let i = 0; i <= MAX_PAUSE_RESUMES; i++) {
    const response = await anthropic().messages.create({
      model,
      max_tokens: 16000,
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: maxUses,
          user_location: { type: "approximate", city: st.agent.searchCity, country: st.agent.searchCountry, timezone: st.agent.searchTimezone },
        },
      ],
      output_config: { effort: "medium" },
      messages,
    });
    await logUsage(feature, response.model ?? model, response.usage as Usage);
    // Long searches pause; send the turn back unchanged and the server resumes.
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    if (response.stop_reason === "refusal") throw new Error("The search was declined. Try asking in a different way.");
    return response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  }
  throw new Error("The search took too long. Please try again.");
}
