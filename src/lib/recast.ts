import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { aboutBlock, getActiveFacts } from "./facts";
import { parseStructured, webResearch as research } from "./claude";
import { forecastRecast, type CastChange } from "./recast-forecast";
import { loadSettings, type Settings } from "./settings";

// Recast Clock: finds dated cast-change announcements for long-running shows,
// tours and cruise casts, then works out the next likely recast window IN CODE.
// Forecasts are labelled as forecasts. Nothing is contacted automatically.

const webResearch = (st: Settings, prompt: string, maxUses?: number) => research(st, prompt, maxUses, "recast");

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https?:\/\//;

const WatchSchema = z.object({
  shows: z.array(
    z.object({
      show: z.string(),
      venue: z.string(),
      kind: z.enum(["west_end", "uk_tour", "oslo", "cruise", "other"]),
      url: z.string(),
      contract_months: z.number(),
      history: z.array(z.object({ date_iso: z.string(), note: z.string(), url: z.string() })),
      fit_note: z.string(),
    }),
  ),
});

export type RecastResult = { found: number; withForecast: number };

export type WatchedShow = {
  id: string;
  show: string;
  venue: string;
  kind: string;
  url: string | null;
  history: CastChange[];
  predicted_from: string | null;
  predicted_to: string | null;
  confidence: string | null;
  basis: string | null;
  fit_note: string | null;
  last_checked: string;
};

export async function runRecast(db: SupabaseClient): Promise<RecastResult> {
  const [st, facts, { data: existing }] = await Promise.all([
    loadSettings(db),
    getActiveFacts(db),
    db.from("watched_shows").select("show, venue, history, contract_months").limit(300),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const about = aboutBlock(facts, st);
  const intro =
    `${about}\n\nToday is ${today}. Scope: ${st.recast.scope}.\n\n` +
    "Find long-running shows, tours and cruise or ferry casts that recast (new cast announced) on a recurring cycle. For each, find DATED cast-change announcements from the last three years (the date of each announcement, a short note, and the public page). Also find the typical contract length if a source states it (for example 6 or 12 months). Only real, dated announcements with a link. Do not guess dates.";

  const [westEnd, tours, cruise] = await Promise.all([
    webResearch(st, `${intro}\n\nKIND: West End and long-running London musicals, using theatre press (WhatsOnStage, The Stage, BroadwayWorld UK) cast-change announcements. Find 6 to 10 shows.`, 10),
    webResearch(st, `${intro}\n\nKIND: UK tours, and Oslo and wider Norwegian houses (Folketeatret, Chateau Neuf, Oslo Nye Teater, Det Norske Teatret and others), using press cast announcements. Find 5 to 8.`, 10),
    webResearch(st, `${intro}\n\nKIND: cruise and ferry lines (Color Line, Hurtigruten, Havila and similar): new ships, refits, entertainment season hiring, with dates and sources. Find 3 to 6.`, 10),
  ]);

  const parsedOut = await parseStructured({
    st,
    tier: "light",
    feature: "recast",
    maxTokens: 14000,
    system: `Turn the research notes into a watch list. Copy URLs exactly; never invent a URL or a date. history has one entry per real dated announcement: date_iso is YYYY-MM-DD, note is a few words, url is the page showing it; drop entries without a real date and page. contract_months is a number only if a source states it, otherwise 0. fit_note is one short sentence on which tracks could suit this performer (actor-musician, swing or cover, dance and movement, ensemble) based on the About list; do not invent credits.`,
    messages: [{ role: "user", content: `${about}\n\nWEST END NOTES:\n${westEnd}\n\nTOURS AND OSLO NOTES:\n${tours}\n\nCRUISE NOTES:\n${cruise}` }],
    schema: WatchSchema,
  });
  const shows = (parsedOut.shows ?? []).filter((s) => s.show.trim() && s.venue.trim());

  const known = new Map((existing ?? []).map((e) => [`${e.show}|${e.venue}`, e]));
  let withForecast = 0;
  for (const s of shows) {
    // Merge with history already stored, de-duplicated by date. Only past, dated, linked entries.
    const prior = ((known.get(`${s.show}|${s.venue}`)?.history ?? []) as CastChange[]).filter((h) => ISO.test(h.date));
    const merged = new Map<string, CastChange>();
    for (const h of prior) merged.set(h.date, h);
    for (const h of s.history) {
      if (ISO.test(h.date_iso) && h.date_iso <= today && URL_RE.test(h.url)) merged.set(h.date_iso, { date: h.date_iso, note: h.note, url: h.url });
    }
    const history = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
    const contract = s.contract_months > 0 ? s.contract_months : ((known.get(`${s.show}|${s.venue}`)?.contract_months as number | null) ?? null);
    const f = forecastRecast(history, contract, today);
    if (f) withForecast++;
    await db.from("watched_shows").upsert(
      {
        show: s.show,
        venue: s.venue,
        kind: s.kind,
        url: URL_RE.test(s.url) ? s.url : null,
        contract_months: contract,
        history,
        predicted_from: f?.from ?? null,
        predicted_to: f?.to ?? null,
        confidence: f?.confidence ?? null,
        basis: f?.basis ?? null,
        fit_note: s.fit_note || null,
        last_checked: new Date().toISOString(),
      },
      { onConflict: "show,venue" },
    );
  }
  return { found: shows.length, withForecast };
}

// Windows starting within `days` (or already open), nearest first, for Picks and the chat.
export async function recastsToWatch(db: SupabaseClient, days = 90, now = new Date()): Promise<WatchedShow[]> {
  const today = now.toISOString().slice(0, 10);
  const until = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await db
    .from("watched_shows")
    .select("*")
    .not("predicted_from", "is", null)
    .gte("predicted_to", today)
    .lte("predicted_from", until)
    .order("predicted_from")
    .limit(12);
  return (data ?? []) as WatchedShow[];
}

export async function allWatched(db: SupabaseClient): Promise<WatchedShow[]> {
  const { data } = await db.from("watched_shows").select("*").order("predicted_from", { ascending: true, nullsFirst: false }).limit(100);
  return (data ?? []) as WatchedShow[];
}
