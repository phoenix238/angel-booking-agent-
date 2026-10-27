import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SYSTEM_PROMPT } from "./llm";
import { createAdminClient } from "./supabase/admin";

// Everything client-specific lives in one app_settings row so the app can be
// set up for a new client from the Settings page. Defaults are neutral
// placeholders; fill them in during onboarding (/onboarding) or in Settings.

const Pronouns = z.enum(["she", "he", "they"]);

const ClientSchema = z.object({
  name: z.string().min(1).default("Your Name"),
  firstName: z.string().min(1).default("You"),
  pronouns: Pronouns.default("she"),
  summary: z.string().default("a performer looking for castings and funding"),
  disciplines: z.array(z.string()).default([]),
  based: z.string().default(""),
  portrait: z.string().default(""),
  training: z
    .array(z.object({ course: z.string(), school: z.string() }))
    .default([]),
  credits: z
    .array(z.object({ show: z.string(), role: z.string(), where: z.string().default(""), year: z.string().default("") }))
    .default([]),
  links: z
    .array(z.object({ label: z.string(), href: z.string() }))
    .default([]),
});

const AgentSchema = z.object({
  name: z.string().min(1).default("Agent Angel"),
  catchphrase: z.string().default("Let's find you your next gig xx"),
  opening: z
    .string()
    .default("Hi! I'm Agent Angel, your agent. I want to get to know you and what you're looking for next, so I can find you the right castings and funding. Quick one first: tell me a bit about what you do and the kind of work you want."),
  tone: z
    .string()
    .default(
      'Always positive and encouraging. Talk like a supportive modern-day girlie best friend who is also brilliant at her job: warm, hyped, a little playful ("babe", "obsessed", "iconic", "you\'ve got this"), with the odd emoji. British spelling.',
    ),
  voice: z.string().default("bubbly, positive casting agent who talks like a supportive modern-day girlie best friend"),
  learnTopics: z
    .string()
    .default("skills and their level, training, the kinds of roles and projects that excite them, availability, touring, screen work, their own work, grants and funding"),
  searchFocus: z.string().default("performance work that fits their profile"),
  placesToLook: z.string().default("the UK, plus major grants"),
  searchCity: z.string().default("London"),
  searchCountry: z.string().length(2).default("GB"),
  searchTimezone: z.string().default("Europe/London"),
});

const DigestSchema = z.object({
  enabled: z.boolean().default(false),
  recipients: z.array(z.string().email()).default([]),
});

const ShowSchema = z.object({
  title: z.string().default(""),
  summary: z.string().default(""),
  festival: z.string().default(""),
  fundingCountries: z.string().default("the UK"),
});

const RadarSchema = z.object({
  enabled: z.boolean().default(true),
  venues: z.string().default("Add theatres, festivals and companies you want watched, separated by commas."),
});

const StudiosSchema = z.object({
  skills: z.string().default("describe your skills here"),
  markets: z.string().default("the UK"),
});

const RecastSchema = z.object({
  enabled: z.boolean().default(true),
  scope: z.string().default("UK West End and touring productions"),
});

// Where the client can work or apply. Written into the scoring prompt's "Ignore anything
// outside ..." sentence so what Claude is told matches what Settings shows.
const RegionsSchema = z.object({
  places: z.array(z.string()).min(1).default(["UK"]),
  note: z.string().default(""),
});

// Angel's inbox: confirm newsletter subscriptions herself when the link is safe.
const InboxSchema = z.object({ autoConfirm: z.boolean().default(true) });

const OnboardingSchema = z.object({ done: z.boolean().default(false), questions: z.array(z.string()).default([]) });

export const MODEL_IDS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] as const;
export type ModelId = (typeof MODEL_IDS)[number];

// Which Claude model does which job. Cheap model for the high-volume jobs.
const ModelsSchema = z.object({
  light: z.enum(MODEL_IDS).default("claude-haiku-5-5"), // scoring notices and tidying research into data
  chat: z.enum(MODEL_IDS).default("claude-sonnet-5-5"), // the agent chat
  research: z.enum(["claude-sonnet-5-5", "claude-opus-5-5"]).default("claude-sonnet-5-5"), // web research (needs web search)
});

const BudgetSchema = z.object({
  monthlyCapUsd: z.number().min(0).max(1000).default(0), // optional limit; 0 = no limit, just count
});

// A free keyword check that skips obviously unrelated notices before any AI is used.
const FilterSchema = z.object({
  enabled: z.boolean().default(true),
  extraWords: z.string().default(""),
});

const job = (everyDays: number) =>
  z.object({ everyDays: z.number().int().min(1).max(365).default(everyDays), auto: z.boolean().default(false) });
// Routine jobs ask first by default ("request mode"). auto = run on its own schedule.
const RoutineSchema = z.object({
  feeds: job(3).prefault({}),
  mail: job(2).prefault({}),
  radar: job(14).prefault({}),
  recast: job(30).prefault({}),
});

export const SettingsSchema = z.object({
  client: ClientSchema.prefault({}),
  agent: AgentSchema.prefault({}),
  scoringPrompt: z.string().min(1).default(SYSTEM_PROMPT),
  digest: DigestSchema.prefault({}),
  show: ShowSchema.prefault({}),
  radar: RadarSchema.prefault({}),
  studios: StudiosSchema.prefault({}),
  recast: RecastSchema.prefault({}),
  models: ModelsSchema.prefault({}),
  budget: BudgetSchema.prefault({}),
  filter: FilterSchema.prefault({}),
  routine: RoutineSchema.prefault({}),
  regions: RegionsSchema.prefault({}),
  onboarding: OnboardingSchema.prefault({}),
  inbox: InboxSchema.prefault({}),
});

export type Settings = z.infer<typeof SettingsSchema>;

export async function loadSettings(db: SupabaseClient): Promise<Settings> {
  const { data } = await db.from("app_settings").select("config").eq("id", 1).maybeSingle();
  const parsed = SettingsSchema.safeParse(data?.config ?? {});
  // A bad saved value must never break the app: fall back to defaults.
  return parsed.success ? parsed.data : SettingsSchema.parse({});
}

// Per-request cached read for pages and layouts.
export const getSettings = cache(() => loadSettings(createAdminClient()));

export async function saveSettings(db: SupabaseClient, next: Settings) {
  const { error } = await db
    .from("app_settings")
    .upsert({ id: 1, config: SettingsSchema.parse(next), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export function pronounWords(p: Settings["client"]["pronouns"]) {
  if (p === "he") return { subj: "he", obj: "him", poss: "his" };
  if (p === "they") return { subj: "they", obj: "them", poss: "their" };
  return { subj: "she", obj: "her", poss: "her" };
}

export function openingMessage(s: Settings) {
  return `${s.agent.opening.trim()} ${s.agent.catchphrase}`.trim();
}

export function withCatchphrase(s: Settings, text: string) {
  const c = s.agent.catchphrase.trim();
  if (!c || text.trim().endsWith(c)) return text;
  return `${text.trim()} ${c}`;
}

// "the UK, Norway and the EU/EEA"
export function placesPhrase(places: string[]): string {
  const named = places.map((p) => (p === "UK" ? "the UK" : p === "EU/EEA" ? "the EU/EEA" : p));
  if (named.length <= 1) return named[0] ?? "the UK";
  return `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
}

const PLACES_SENTENCE = /Ignore anything outside[^.]*\./;

// The sentence that goes into the scoring prompt. UK only keeps the original wording exactly.
export function placesSentence(places: string[]): string {
  if (places.length === 1 && places[0] === "UK") return "Ignore anything outside the UK unless it's a major EU grant.";
  return `Ignore anything outside ${placesPhrase(places)} unless it's a major opportunity she could realistically take up.`;
}

// Rewrites only that one sentence. Returns null if the prompt no longer has it (edited by hand).
export function withPlaces(prompt: string, places: string[]): string | null {
  return PLACES_SENTENCE.test(prompt) ? prompt.replace(PLACES_SENTENCE, placesSentence(places)) : null;
}
