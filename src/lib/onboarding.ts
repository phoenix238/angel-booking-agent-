import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { parseStructured } from "./claude";
import type { Settings } from "./settings";

// Onboarding: Angel reads the client's own website (a public page) and drafts their profile.
// Nothing is saved from here; the client reviews and edits the draft first.

function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (v === 6) {
    const l = ip.toLowerCase();
    return l === "::1" || l === "::" || l.startsWith("fe80") || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("::ffff:127.") || l.startsWith("::ffff:10.") || l.startsWith("::ffff:192.168.");
  }
  return true;
}

export async function assertPublicUrl(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Use a normal web address starting with https://");
  if (u.username || u.password) throw new Error("That web address has a login in it. Use the plain address.");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("That web address uses an unusual port.");
  const host = u.hostname;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("That address is not a public website.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error("That address is not a public website.");
}

const MAX_BYTES = 1_500_000;

export type PageContent = { url: string; text: string; links: { label: string; href: string }[] };

export async function fetchPublicPage(raw: string): Promise<PageContent> {
  let current: URL;
  try {
    current = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new Error("That does not look like a web address.");
  }
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(current);
    res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AgentAngelBot/1.0)", Accept: "text/html,text/plain" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current);
      continue;
    }
    break;
  }
  if (!res || !res.ok) throw new Error(`Could not open that page (${res?.status ?? "no answer"}).`);
  const type = res.headers.get("content-type") ?? "";
  if (!/text\/(html|plain)/i.test(type)) throw new Error("That link is not a web page.");

  // Read at most MAX_BYTES.
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const html = Buffer.concat(chunks).toString("utf8");

  const links: PageContent["links"] = [];
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const href = new URL(m[1], current).toString();
      const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
      if (/^https?:/.test(href) && !links.some((l) => l.href === href)) links.push({ label: label || new URL(href).hostname, href });
    } catch {
      // skip bad links
    }
  }
  const text = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { url: current.toString(), text: text.slice(0, 14_000), links: links.slice(0, 40) };
}

const ProfileSchema = z.object({
  name: z.string(),
  first_name: z.string(),
  pronouns: z.enum(["she", "he", "they"]),
  summary: z.string(),
  disciplines: z.array(z.string()),
  based: z.string(),
  training: z.array(z.object({ course: z.string(), school: z.string() })),
  credits: z.array(z.object({ show: z.string(), role: z.string(), where: z.string(), year: z.string() })),
  links: z.array(z.object({ label: z.string(), href: z.string() })),
  facts: z.array(z.string()),
  questions: z.array(z.string()),
});
export type ProfileDraft = z.infer<typeof ProfileSchema>;

export async function draftProfileFromPage(st: Settings, page: PageContent): Promise<ProfileDraft> {
  if (page.text.length < 300) {
    throw new Error("That page shows almost no text without a browser (many sites are built that way). Fill the boxes in by hand, or try a different link.");
  }
  const draft = await parseStructured({
    st,
    tier: "light",
    feature: "onboarding",
    maxTokens: 6000,
    system:
      `You read a performer's own website and draft their profile. Use ONLY what the page states; never invent anything and never guess. ` +
      `name is their full name; first_name the first name only. pronouns: "she" or "he" only if the page uses them for this person, otherwise "they". ` +
      `summary is one short line such as "a musical theatre actor-musician based in London and Oslo". disciplines are their own words (Actor, Singer, ...). ` +
      `training lists degrees and schools. credits lists up to 8 of the most notable shows or projects (show, role, where, year; use an empty string for anything not stated). ` +
      `links must be copied exactly from the LINKS list (website, casting profile, social media, showreel); use a short label. ` +
      `facts are short standalone statements about them in the third person that are NOT already in the other fields: skills, instruments, languages, heritage, achievements, interests, representation. ` +
      `questions lists up to 5 things a casting agent would still need to ask because the page does not say (for example instrument levels, voice type and range, playing age, languages, accents). Write each question addressed to the performer in the second person, e.g. "What is your singing voice type and range?".`,
    messages: [
      {
        role: "user",
        content: `PAGE (${page.url}):\n${page.text}\n\nLINKS:\n${page.links.map((l) => `${l.label} | ${l.href}`).join("\n")}`,
      },
    ],
    schema: ProfileSchema,
  });
  // Links must come from the page itself.
  const allowed = new Set(page.links.map((l) => l.href));
  return { ...draft, links: draft.links.filter((l) => allowed.has(l.href)) };
}
