import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { aboutBlock, getActiveFacts } from "./facts";
import { parseStructured, webResearch as research } from "./claude";
import { loadSettings, withCatchphrase, type Settings } from "./settings";

// Studio Map: companies with a reason to hire the client's rare skill mix.
// These do NOT go through the audition scorer, whose "ignore anything outside the
// UK" rule would sink Nordic studios. Fit is scored in the structuring call instead.

const webResearch = (st: Settings, prompt: string, maxUses?: number) => research(st, prompt, maxUses, "studios");

export type StudioKind = "voice" | "capture" | "music" | "other";

const StudiosSchema = z.object({
  message: z.string(),
  studios: z.array(
    z.object({
      name: z.string(),
      country: z.string(),
      kind: z.enum(["voice", "capture", "music", "other"]),
      url: z.string(),
      submission_url: z.string(),
      what_they_buy: z.string(),
      evidence: z.string(),
      evidence_url: z.string(),
      why: z.string(),
      fit_score: z.number(),
      pitch_draft: z.string(),
    }),
  ),
});

export type StudioResult = { message: string; found: number; added: number };

const URL_RE = /^https?:\/\//;

export async function runStudios(db: SupabaseClient, focus = ""): Promise<StudioResult> {
  const [st, facts, { data: known }] = await Promise.all([
    loadSettings(db),
    getActiveFacts(db),
    db.from("studios").select("name").limit(200),
  ]);
  const first = st.client.firstName;
  const about = aboutBlock(facts, st);
  const intro =
    `${about}\n\n${first} ${st.studios.skills}. Markets: ${st.studios.markets}.${focus ? `\nFocus this time: ${focus}` : ""}\n\n` +
    `You are building a map of companies that have a real reason to hire someone with this skill mix, beyond theatre casting. ` +
    `Only real companies with an official website. For each: what they buy, one recent project of theirs backed by a public page, and how artists can approach them (a public talent or contact page; business contact details only). ` +
    (known?.length ? `Already on the map, do not repeat: ${known.map((k) => k.name).join("; ")}. ` : "") +
    "Give the exact official URL for everything; leave out anything you cannot link to.";

  // Three kinds of studio, searched in parallel so no one kind uses up the others' budget.
  const [voice, capture, music] = await Promise.all([
    webResearch(
      st,
      `${intro}\n\nKIND: voice. Dubbing and localisation houses, audiobook and podcast producers and publishers, voice and singing for animation, children's TV and commercials, in these markets. Find 5 to 8.`,
      10,
    ),
    webResearch(
      st,
      `${intro}\n\nKIND: capture. Performance and motion capture stages, games studios and games audio teams that cast performers, screen and stunt movement companies, and combat and physical performance specialists. Find 5 to 8.`,
      10,
    ),
    webResearch(
      st,
      `${intro}\n\nKIND: music. Music production and library music companies, jingle and advertising music houses, cast recording and session companies, immersive and event companies that hire musicians who also perform. Find 5 to 8.`,
      10,
    ),
  ]);

  const parsedOut = await parseStructured({
    st,
    tier: "light",
    feature: "studios",
    maxTokens: 14000,
    system: `You are ${st.agent.name}, ${first}'s ${st.agent.voice}. Turn the research notes into a Studio Map.

Rules:
- Copy URLs exactly and never invent one. Drop any studio without an official url.
- evidence names ONE recent project of the studio, and evidence_url is the page that shows it. If the notes do not back a project with a page, leave both empty.
- pitch_draft is a short, warm business email ${first} could adapt and send (no more than 110 words, British spelling, one specific skill offered, asks how to be considered). It may mention a project of theirs ONLY if it is the one in evidence; otherwise it names no project at all. Never invent credits for ${first} either: only use facts from the About list.
- fit_score is 1 to 10: how well this studio's needs match ${first}'s skills and markets. Do not penalise a studio for being outside the UK.
- kind is voice, capture, music or other. what_they_buy is a short phrase. country is the studio's main country.
Also write message: two to four excited sentences to ${first} on the best finds. Do not promise more research later. End the message with exactly: "${st.agent.catchphrase}"`,
    messages: [{ role: "user", content: `VOICE NOTES:\n${voice}\n\nCAPTURE NOTES:\n${capture}\n\nMUSIC NOTES:\n${music}` }],
    schema: StudiosSchema,
  });
  const r = parsedOut;

  const studios = r.studios.filter((s) => s.name.trim() && URL_RE.test(s.url));
  let added = 0;
  if (studios.length) {
    const { data } = await db
      .from("studios")
      .upsert(
        studios.map((s) => {
          const hasEvidence = URL_RE.test(s.evidence_url) && s.evidence.trim();
          return {
            name: s.name,
            country: s.country || null,
            kind: s.kind,
            url: s.url,
            submission_url: URL_RE.test(s.submission_url) ? s.submission_url : null,
            what_they_buy: s.what_they_buy || null,
            evidence: hasEvidence ? s.evidence : null,
            evidence_url: hasEvidence ? s.evidence_url : null,
            why: s.why || null,
            fit_score: Math.min(10, Math.max(1, Math.round(s.fit_score))),
            pitch_draft: s.pitch_draft || null,
          };
        }),
        { onConflict: "url", ignoreDuplicates: true },
      )
      .select("id");
    added = data?.length ?? 0;
  }
  return { message: withCatchphrase(st, r.message), found: studios.length, added };
}
