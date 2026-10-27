import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseStructured, webResearch as research } from "./claude";
import { aboutBlock, getActiveFacts } from "./facts";
import { assertPublicUrl } from "./onboarding";
import { loadSettings, withCatchphrase, type Settings } from "./settings";

// Angel suggests mailing lists worth joining: casting alerts, funding newsletters, and the lists of
// theatres, festivals and companies. Every sign-up page is checked to be real before it is shown.

const webResearch = (st: Settings, prompt: string, maxUses?: number) => research(st, prompt, maxUses, "lists");

const SuggestSchema = z.object({
  message: z.string(),
  lists: z.array(
    z.object({
      name: z.string(),
      organisation: z.string(),
      kind: z.enum(["casting", "funding", "venue", "other"]),
      what_it_sends: z.string(),
      why: z.string(),
      signup_url: z.string(),
      cost: z.enum(["free", "paid", "unknown"]),
    }),
  ),
});

// Is this a real, public page where someone could subscribe? Returns the final address if so.
export async function probeSignupPage(raw: string): Promise<string | null> {
  try {
    let current = new URL(raw);
    for (let hop = 0; hop < 4; hop++) {
      await assertPublicUrl(current);
      const res = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AgentAngelBot/1.0)", Accept: "text/html" },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current);
        continue;
      }
      if (!res.ok) return null;
      const html = (await res.text()).slice(0, 400_000);
      const looksLikeSignup = /type=["']?email|subscribe|sign.?up|newsletter|mailing list|email alerts|job alerts/i.test(html);
      return looksLikeSignup ? current.toString() : null;
    }
  } catch {
    // unreachable or blocked: not a usable page
  }
  return null;
}

export type FindListsResult = { message: string; added: number; checked: number; dropped: number };

export async function findLists(db: SupabaseClient, focus = ""): Promise<FindListsResult> {
  const [st, facts, { data: known }] = await Promise.all([
    loadSettings(db),
    getActiveFacts(db),
    db.from("list_suggestions").select("name, signup_url").limit(300),
  ]);
  const first = st.client.firstName;
  const intro =
    `${aboutBlock(facts, st)}\n\nFind email lists (newsletters, alert services, mailing lists) that ${first} should join so castings, auditions, jobs and funding calls arrive by email. ` +
    `Prefer free ones; say so when a list is paid. Places that count: ${st.regions.places.join(", ")}.${focus ? ` Focus this time: ${focus}` : ""} ` +
    "For each, give the exact public page where a visitor can type an email address to subscribe (not a login page), what the list sends, and why it suits " +
    `${first}. Only real, current lists.` +
    (known?.length ? ` Already known, do not repeat: ${known.map((k) => k.name).join("; ")}.` : "");

  const [casting, funding, venues] = await Promise.all([
    webResearch(st, `${intro}\n\nKIND: casting alert services and job boards with email alerts for actor-musicians and musical theatre performers. Find 4 to 6.`, 8),
    webResearch(st, `${intro}\n\nKIND: arts funding and opportunity newsletters for performers and theatre makers (grants, residencies, open calls). Find 4 to 6.`, 8),
    webResearch(st, `${intro}\n\nKIND: theatres, festivals, producers, agencies and companies that email their own casting news and open calls (actor-musician, new writing, musical theatre). Find 4 to 6.`, 8),
  ]);

  const r = await parseStructured({
    st,
    tier: "light",
    feature: "lists",
    maxTokens: 8000,
    system:
      `You are ${st.agent.name}, ${first}'s ${st.agent.voice}. Turn the research notes into a list of mailing lists to join. Copy sign-up URLs exactly and never invent one; drop anything without a URL. ` +
      "what_it_sends is a short phrase. why is one sentence on why it suits her. cost is free, paid or unknown. " +
      `Also write message: two or three excited sentences to ${first} about the best ones. End the message with exactly: "${st.agent.catchphrase}"`,
    messages: [{ role: "user", content: `CASTING NOTES:\n${casting}\n\nFUNDING NOTES:\n${funding}\n\nVENUE AND COMPANY NOTES:\n${venues}` }],
    schema: SuggestSchema,
  });

  const knownUrls = new Set((known ?? []).map((k) => k.signup_url as string));
  const candidates = r.lists.filter((l) => /^https?:\/\//.test(l.signup_url) && l.name.trim() && !knownUrls.has(l.signup_url));
  const probed = await Promise.all(candidates.map(async (l) => ({ l, url: await probeSignupPage(l.signup_url) })));
  const good = probed.filter((p) => p.url !== null);
  let added = 0;
  if (good.length) {
    const { data } = await db
      .from("list_suggestions")
      .upsert(
        good.map(({ l, url }) => ({
          name: l.name,
          organisation: l.organisation || null,
          kind: l.kind,
          what_it_sends: l.what_it_sends || null,
          why: l.why || null,
          signup_url: url!,
          cost: l.cost,
        })),
        { onConflict: "signup_url", ignoreDuplicates: true },
      )
      .select("id");
    added = data?.length ?? 0;
  }
  return { message: withCatchphrase(st, r.message), added, checked: candidates.length, dropped: candidates.length - good.length };
}
