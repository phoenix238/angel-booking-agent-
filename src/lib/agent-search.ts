import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { aboutBlock, getActiveFacts } from "./facts";
import { ingestItem } from "./ingest";
import { loadSettings, pronounWords, withCatchphrase, type Settings } from "./settings";
import { parseStructured, webResearch } from "./claude";

const FindSchema = z.object({
  kind: z.enum(["audition", "grant", "mailing_list", "instagram_account", "other"]),
  instagram_handle: z.string(),
  title: z.string(),
  organisation: z.string(),
  url: z.string(),
  deadline: z.string(),
  deadline_iso: z.string(),
  location: z.string(),
  details: z.string(),
  why: z.string(),
});

const ResultSchema = z.object({
  message: z.string(),
  finds: z.array(FindSchema),
});

export type Find = z.infer<typeof FindSchema> & { score?: number; saved?: boolean };


// One AGENT_SEARCH source holds everything Agent Angel finds, so finds dedupe by URL.
async function agentSourceId(db: SupabaseClient): Promise<string> {
  const { data } = await db.from("sources").select("id").eq("type", "AGENT_SEARCH").maybeSingle();
  if (data) return data.id as string;
  const { data: created, error } = await db
    .from("sources")
    .insert({ type: "AGENT_SEARCH", value: "agent-search", label: "Agent finds" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

// Step 1: Claude searches the web and writes up what it found as plain text.
async function research(st: Settings, brief: string, about: string, alreadyFound: string[]): Promise<string> {
  const { subj, obj } = pronounWords(st.client.pronouns);
  const prompt = `${about}

You are researching current opportunities for ${st.client.firstName}. ${brief ? `Focus: ${brief}` : `Find the best current opportunities for ${obj}.`}

Search the web for things ${subj} could apply for right now: open auditions and casting calls (especially ${st.agent.searchFocus}), grants, bursaries, residencies and funding for performers or for her own show, mailing lists or job alert services that regularly send castings like these, and public Instagram accounts (casting directors, casting pages, theatres, agencies) that regularly post castings like these. Prefer ${st.agent.placesToLook}. Only include things that are open now or soon, with a real page ${subj} can visit. Skip anything closed or vague. Strongly prefer free sources and free-to-apply opportunities; if something needs a paid subscription or an application fee, say so clearly and only include it if it is really worth it.
${alreadyFound.length ? `\nAlready found before, do not repeat:\n${alreadyFound.map((t) => `- ${t}`).join("\n")}\n` : ""}
Spread your searches: roughly a third on auditions and casting calls, a third on grants and funding, a third on mailing lists, alert services and Instagram accounts that post castings. Keep each search focused, and stop searching once you have enough. Write up 4 to 8 of the best finds, with a mix of kinds. For each give: kind (audition, grant, mailing list, instagram account or other), the Instagram @handle for Instagram accounts, title, organisation, the exact URL, deadline (or "rolling" / "not stated"), location, a few sentences on what the listing asks for (roles, requirements, pay, dates), and why it suits ${st.client.firstName}.`;

  return webResearch(st, prompt, 12, "search");
}

// Step 2: turn the write-up into structured finds plus a message in Agent Angel's voice.
async function structure(st: Settings, writeUp: string): Promise<z.infer<typeof ResultSchema>> {
  const first = st.client.firstName;
  return parseStructured({
    st,
    tier: "light",
    feature: "search",
    maxTokens: 8000,
    system: `You are ${st.agent.name}, ${first}'s ${st.agent.voice}. Turn the research notes into a list of finds (copy URLs exactly, never invent one; drop any find without a URL). For instagram_account finds set instagram_handle to the @handle without the @ and use the profile link as the URL; for every other kind set instagram_handle to an empty string. For deadline_iso give the closing date as YYYY-MM-DD only when there is a real closing date; use an empty string for rolling, unknown, or dates that are only when a form opens. Then write a short, excited message to ${first} (two to four sentences) introducing them. Point out anything with a close deadline, and flag anything that costs money. Do not promise to search more later; if a kind of opportunity is missing, suggest ${pronounWords(st.client.pronouns).subj} taps "Find me things to apply for" or tells you what to look for. End the message with exactly: "${st.agent.catchphrase}"`,
    messages: [{ role: "user", content: writeUp }],
    schema: ResultSchema,
  });
}

// Searches, scores each audition/grant with the normal scorer, saves them to Matches,
// and posts Agent Angel's message with the find cards into the chat.
export async function runAgentSearch(db: SupabaseClient, brief: string): Promise<{ message: string; finds: Find[] }> {
  const sourceId = await agentSourceId(db);
  const [st, facts, { data: previous }] = await Promise.all([
    loadSettings(db),
    getActiveFacts(db),
    db.from("auditions").select("title").eq("source_id", sourceId).order("created_at", { ascending: false }).limit(40),
  ]);
  const about = aboutBlock(facts, st);
  const ctx = { prompt: st.scoringPrompt, about, st };

  const writeUp = await research(st, brief, about, (previous ?? []).map((p) => p.title as string));
  const result = await structure(st, writeUp);

  const finds: Find[] = await Promise.all(
    result.finds
      .filter((f) => /^https?:\/\//.test(f.url))
      .map(async (f) => {
        if (f.kind === "mailing_list" || f.kind === "instagram_account") return f;
        const text = [
          f.title,
          `Organisation: ${f.organisation}`,
          `Location: ${f.location}`,
          `Deadline: ${f.deadline}`,
          f.details,
        ].join("\n");
        try {
          await ingestItem(db, {
            sourceId,
            externalId: f.url,
            text,
            url: f.url,
            fallbackTitle: f.title,
            deadline: /^\d{4}-\d{2}-\d{2}$/.test(f.deadline_iso) ? f.deadline_iso : null,
            deadlineText: f.deadline,
          }, ctx);
          const { data } = await db
            .from("auditions")
            .select("match_score")
            .eq("source_id", sourceId)
            .eq("external_id", f.url)
            .maybeSingle();
          return { ...f, score: data?.match_score as number | undefined, saved: true };
        } catch {
          return { ...f, saved: false };
        }
      }),
  );

  const message = withCatchphrase(st, result.message);
  await db.from("chat_messages").insert({ role: "assistant", content: message, finds });
  return { message, finds };
}
