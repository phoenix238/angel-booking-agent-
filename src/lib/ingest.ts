import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classify } from "./classify";
import { aboutBlock, getActiveFacts } from "./facts";
import { loadSettings, type Settings } from "./settings";
import { scoreNotice } from "./llm";
import { passesFilter } from "./prefilter";

export type IncomingItem = {
  sourceId: string;
  externalId: string;
  text: string;
  url?: string | null;
  datePosted?: string | null;
  fallbackTitle?: string | null;
  deadline?: string | null; // YYYY-MM-DD
  deadlineText?: string | null;
  projectId?: string | null; // producer funding belongs to a project
  prefilter?: boolean; // feeds and Instagram: skip obviously unrelated notices for free
  emailId?: string | null; // the newsletter this item came from
  dedupeKey?: string | null; // same casting from another list is one casting
};

export type IngestOutcome = "skipped" | "match" | "no_match" | "filtered";

// Scores one notice and stores it. Items already stored for this source are
// skipped before calling Claude, so re-runs cost nothing.
// Scoring context (prompt + "About ..." notes). Load once per run and pass it in.
export type ScoringContext = { prompt: string; about: string; st: Settings };

export async function loadScoringContext(db: SupabaseClient): Promise<ScoringContext> {
  const [st, facts] = await Promise.all([loadSettings(db), getActiveFacts(db)]);
  return { prompt: st.scoringPrompt, about: aboutBlock(facts, st), st };
}

export async function ingestItem(db: SupabaseClient, item: IncomingItem, ctx?: ScoringContext): Promise<IngestOutcome> {
  const ctxResolved = ctx ?? (await loadScoringContext(db));
  if (item.prefilter && ctxResolved.st.filter.enabled && !passesFilter(item.text, ctxResolved.st.filter.extraWords)) return "filtered";

  const { data: existing } = await db
    .from("auditions")
    .select("id")
    .eq("source_id", item.sourceId)
    .eq("external_id", item.externalId)
    .maybeSingle();
  if (existing) return "skipped";

  const text = item.text.trim();
  if (!text) return "skipped";

  const { prompt, about, st } = ctxResolved;
  const result = await scoreNotice(text, about, prompt, st);
  const { category, isActorMusician } = classify(text);
  const isMatch = result.score >= 7;

  const { error } = await db.from("auditions").upsert(
    {
      title: result.role_title || item.fallbackTitle || "Untitled notice",
      company: result.company || null,
      description: text.slice(0, 2000),
      source_id: item.sourceId,
      url: item.url ?? null,
      match_score: result.score,
      match_reason: result.match_reason || null,
      is_match: isMatch,
      category,
      is_actor_musician: isActorMusician,
      external_id: item.externalId,
      raw_text: text,
      date_posted: item.datePosted ?? new Date().toISOString(),
      deadline: item.deadline || null,
      deadline_text: item.deadlineText || null,
      project_id: item.projectId ?? null,
      email_id: item.emailId ?? null,
      dedupe_key: item.dedupeKey ?? null,
    },
    { onConflict: "source_id,external_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Saving notice failed: ${error.message}`);
  return isMatch ? "match" : "no_match";
}
