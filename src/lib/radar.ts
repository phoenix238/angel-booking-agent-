import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { aboutBlock, getActiveFacts } from "./facts";
import { ingestItem } from "./ingest";
import { parseStructured, webResearch as research } from "./claude";
import { loadSettings, type Settings } from "./settings";

// Actor-musician radar: spots productions when they are announced, months
// before a casting breakdown, and forecasts when casting will open. Forecasts
// are labelled as such; nothing is contacted automatically.

const ProductionSchema = z.object({
  productions: z.array(
    z.object({
      show: z.string(),
      venue: z.string(),
      run_dates: z.string(),
      announced: z.string(),
      actor_musician: z.boolean(),
      instruments_or_band: z.string(),
      creative_team: z.string(),
      casting_forecast: z.string(),
      url: z.string(),
      notes: z.string(),
    }),
  ),
});

const webResearch = (st: Settings, prompt: string, maxUses?: number) => research(st, prompt, maxUses, "radar");

async function radarSourceId(db: SupabaseClient): Promise<string> {
  const { data } = await db.from("sources").select("id").eq("type", "RADAR").maybeSingle();
  if (data) return data.id as string;
  const { data: created, error } = await db
    .from("sources")
    .insert({ type: "RADAR", value: "actor-musician-radar", label: "Actor-musician radar" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

export type RadarResult = { found: number; matches: number; skipped: number };

export async function runRadar(db: SupabaseClient): Promise<RadarResult> {
  const [st, facts, sourceId] = await Promise.all([loadSettings(db), getActiveFacts(db), radarSourceId(db)]);
  const { data: known } = await db.from("auditions").select("title").eq("source_id", sourceId).order("created_at", { ascending: false }).limit(60);
  const today = new Date().toISOString().slice(0, 10);

  const writeUp = await webResearch(
    st,
    `Today is ${today}. Find NEWLY ANNOUNCED productions (announced in roughly the last 60 days) that will need performers who play instruments on stage: actor-musician productions, musicals with the band on stage, gig theatre, plays with live music played by the cast.

Look first at these venues and companies, then the wider ${st.agent.placesToLook} scene through theatre news (The Stage, WhatsOnStage, BroadwayWorld, Scenekunst.no) and the venues' own season announcements:
${st.radar.venues}

For each production give: the show, the venue or company, run dates, when it was announced, whether it is billed as actor-musician, which instruments or what kind of on-stage band (if stated), the creative team named publicly (director, musical director or supervisor, casting director), a forecast of when casting will probably open (UK and Norwegian theatre usually casts 10 to 16 weeks before rehearsals; say the reasoning), and the exact URL of the announcement.
Skip productions that are already cast or already in performance.${known?.length ? `\nAlready found, do not repeat: ${known.map((k) => k.title).join("; ")}` : ""}`,
    12,
  );

  const parsedOut = await parseStructured({
    st,
    tier: "light",
    feature: "radar",
    maxTokens: 8000,
    system:
      "Turn the research notes into a list of productions. Copy URLs exactly and never invent one; drop anything without a URL. Leave fields empty rather than guessing. casting_forecast is a short phrase like 'Casting likely Jan to Feb 2027 (rehearsals April)'.",
    messages: [{ role: "user", content: writeUp }],
    schema: ProductionSchema,
  });
  const productions = (parsedOut.productions ?? []).filter((p) => /^https?:\/\//.test(p.url) && p.show.trim());

  const ctx = { prompt: st.scoringPrompt, about: aboutBlock(facts, st), st };
  const result: RadarResult = { found: productions.length, matches: 0, skipped: 0 };
  for (const p of productions) {
    const text = [
      `Newly announced production (casting not open yet): ${p.show} at ${p.venue}.`,
      p.actor_musician ? "Billed as an actor-musician production." : "",
      p.instruments_or_band ? `Music on stage: ${p.instruments_or_band}.` : "",
      p.run_dates ? `Runs: ${p.run_dates}.` : "",
      p.creative_team ? `Creative team: ${p.creative_team}.` : "",
      p.casting_forecast ? `Forecast: ${p.casting_forecast}.` : "",
      p.notes,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const outcome = await ingestItem(
        db,
        {
          sourceId,
          externalId: p.url,
          text,
          url: p.url,
          fallbackTitle: `${p.show} (${p.venue})`,
          deadlineText: p.casting_forecast ? `Forecast: ${p.casting_forecast}` : null,
        },
        ctx,
      );
      if (outcome === "match") result.matches++;
      if (outcome === "skipped") result.skipped++;
    } catch (e) {
      console.error("[radar] failed:", p.url, e instanceof Error ? e.message : e);
    }
  }
  await db.from("sources").update({ last_fetched_at: new Date().toISOString() }).eq("id", sourceId);
  return result;
}
