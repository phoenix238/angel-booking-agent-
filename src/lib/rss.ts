import "server-only";
import Parser from "rss-parser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestItem, loadScoringContext, type IngestOutcome, type ScoringContext } from "./ingest";
import type { SourceRow } from "./sources";

const parser = new Parser({ timeout: 20_000, headers: { "User-Agent": "AuditionAgent/1.0" } });

// Newest items only; first run on a big feed would otherwise score dozens of old posts.
const MAX_ITEMS_PER_SOURCE = 25;

// rss-parser passes some XML fields through as objects (e.g. ArtsHub's guid is
// { $: { isPermaLink: "false" } } with no text), so read everything as text.
function asText(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (v && typeof v === "object" && "_" in v) return asText((v as { _: unknown })._);
  return undefined;
}

export type FeedReport ={ sourceId: string; label: string; counts: Record<IngestOutcome | "failed", number>; error?: string };

export async function fetchRssSource(db: SupabaseClient, source: SourceRow, ctx?: ScoringContext): Promise<FeedReport> {
  ctx ??= await loadScoringContext(db);
  const counts: FeedReport["counts"] = { skipped: 0, match: 0, no_match: 0, filtered: 0, failed: 0 };
  const label = source.label || source.handle || source.value;
  try {
    const feed = await parser.parseURL(source.value);
    for (const item of feed.items.slice(0, MAX_ITEMS_PER_SOURCE)) {
      const title = asText(item.title);
      const link = asText(item.link);
      const externalId = asText(item.guid) || link || asText(item.id) || `${title}-${item.isoDate}`;
      const body = asText(item.contentSnippet) || asText(item.content) || asText(item.summary);
      const text = [title, body].filter(Boolean).join("\n\n");
      // One bad post (rate limit, odd LLM reply) must not stop the rest; it is retried next run.
      try {
        const outcome = await ingestItem(db, {
          sourceId: source.id,
          externalId,
          text,
          url: link,
          datePosted: item.isoDate,
          fallbackTitle: title?.slice(0, 120),
          prefilter: true,
        }, ctx);
        counts[outcome]++;
      } catch (e) {
        counts.failed++;
        console.error("[rss] item failed:", label, externalId, e instanceof Error ? e.message : e);
      }
    }
    await db.from("sources").update({ last_fetched_at: new Date().toISOString() }).eq("id", source.id);
    return { sourceId: source.id, label, counts };
  } catch (e) {
    return { sourceId: source.id, label, counts, error: e instanceof Error ? e.message : String(e) };
  }
}

// Checks every automatic source: RSS feeds, then watched Instagram accounts.
export async function fetchEverything(db: SupabaseClient): Promise<FeedReport[]> {
  const ctx = await loadScoringContext(db);
  const { fetchAllInstagram } = await import("./instagram");
  return [...(await fetchAllRss(db, ctx)), ...(await fetchAllInstagram(db, ctx))];
}

export async function fetchAllRss(db: SupabaseClient, ctx?: ScoringContext): Promise<FeedReport[]> {
  const { data, error } = await db
    .from("sources")
    .select("*")
    .eq("type", "INSTAGRAM_RSS")
    .eq("status", "active");
  if (error) throw new Error(error.message);
  const reports: FeedReport[] = [];
  // One feed at a time keeps API rate limits and memory comfortable.
  ctx ??= await loadScoringContext(db);
  for (const source of (data ?? []) as SourceRow[]) reports.push(await fetchRssSource(db, source, ctx));
  return reports;
}
