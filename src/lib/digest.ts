import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSettings, type Settings } from "./settings";
import { deadlineLabel, STATUS_LABEL, type Status } from "./tracker";

type Item = {
  id: string;
  title: string;
  company: string | null;
  url: string | null;
  match_score: number;
  match_reason: string | null;
  status: Status;
  deadline: string | null;
  deadline_text: string | null;
  status_changed_at: string | null;
  created_at: string;
};

export type Digest = {
  subject: string;
  html: string;
  text: string;
  isEmpty: boolean;
  counts: { fresh: number; closing: number; followUp: number };
};

const COLS = "id, title, company, url, match_score, match_reason, status, deadline, deadline_text, status_changed_at, created_at";
const PAPER = "#eae4d9";
const INK = "#25221f";
const SOFT = "#6b625a";
const OXBLOOD = "#881c24";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";

function esc(s: string | null | undefined) {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function lastDigestAt(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.from("digest_runs").select("sent_at").eq("sent", true).order("sent_at", { ascending: false }).limit(1);
  return (data?.[0]?.sent_at as string | undefined) ?? null;
}

export type DigestSections = { closing: Item[]; fresh: Item[]; followUp: Item[] };

// `freshSince`: new matches created after this time. The email uses the last
// sent digest; the in-app Picks view uses a rolling week of untouched matches.
export async function getDigestSections(
  db: SupabaseClient,
  opts: { freshSince: string; onlyUntouched?: boolean },
  now = new Date(),
): Promise<DigestSections> {
  const weekAhead = isoDay(new Date(now.getTime() + 7 * 86_400_000));
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();

  let freshQ = db.from("auditions").select(COLS).gte("match_score", 7).gt("created_at", opts.freshSince).neq("status", "not_for_me");
  if (opts.onlyUntouched) freshQ = freshQ.eq("status", "to_look_at");
  const [fresh, closing, followUp] = await Promise.all([
    freshQ.order("match_score", { ascending: false }).limit(15),
    db.from("auditions").select(COLS).gte("deadline", isoDay(now)).lte("deadline", weekAhead).in("status", ["to_look_at", "want_to_apply"]).gte("match_score", 7).order("deadline").limit(15),
    db.from("auditions").select(COLS).eq("status", "applied").lt("status_changed_at", twoWeeksAgo).order("status_changed_at").limit(15),
  ]);
  const sections: DigestSections = {
    closing: (closing.data ?? []) as Item[],
    fresh: (fresh.data ?? []) as Item[],
    followUp: (followUp.data ?? []) as Item[],
  };
  // Something closing soon is the most urgent; don't list it twice.
  const closingIds = new Set(sections.closing.map((i) => i.id));
  sections.fresh = sections.fresh.filter((i) => !closingIds.has(i.id));
  return sections;
}

// Radar finds: announced productions not cast yet, still undecided.
export async function getComingUp(db: SupabaseClient): Promise<Item[]> {
  const { data } = await db
    .from("auditions")
    .select(`${COLS}, sources!inner(type)`)
    .eq("sources.type", "RADAR")
    .in("status", ["to_look_at", "want_to_apply"])
    .gte("match_score", 6)
    .order("match_score", { ascending: false })
    .limit(12);
  return (data ?? []) as unknown as Item[];
}

// In-app Picks: a rolling week of untouched matches, plus closing soon and follow ups.
export async function getPicks(db: SupabaseClient, now = new Date()): Promise<DigestSections> {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  return getDigestSections(db, { freshSince: weekAgo, onlyUntouched: true }, now);
}

export async function buildDigest(db: SupabaseClient, now = new Date()): Promise<Digest> {
  const st = await loadSettings(db);
  const since = (await lastDigestAt(db)) ?? new Date(now.getTime() - 24 * 3600_000).toISOString();
  const sections = await getDigestSections(db, { freshSince: since }, now);
  return renderDigest(sections, st);
}

export function renderDigest(sections: DigestSections, st: Settings): Digest {
  const counts = { fresh: sections.fresh.length, closing: sections.closing.length, followUp: sections.followUp.length };
  const isEmpty = counts.fresh + counts.closing + counts.followUp === 0;
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const bits = [
    counts.closing && `${counts.closing} closing soon`,
    counts.fresh && `${counts.fresh} new match${counts.fresh === 1 ? "" : "es"}`,
    counts.followUp && `${counts.followUp} to follow up`,
  ].filter(Boolean);
  const subject = isEmpty ? "Your casting digest: all quiet today" : `Your casting digest: ${bits.join(", ")}`;

  const intro = isEmpty
    ? "Nothing new today, babe, so enjoy a breather. I'm still watching everything for you."
    : counts.closing
      ? "Okay babe, a few deadlines are coming up fast, so those are at the top. Here's everything since my last update."
      : "Hiya babe! Here's what I've found for you since my last update.";

  const card = (i: Item, extra: string) => `
    <tr><td style="padding:0 0 12px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f2eb;border:1px solid #ddd4c7;border-radius:16px">
        <tr><td style="padding:16px 18px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-family:${SERIF};font-size:18px;line-height:1.3;color:${INK}">${esc(i.title)}</td>
            <td align="right" valign="top" style="font-family:${SANS};font-size:13px;font-weight:bold;color:${i.match_score >= 8 ? OXBLOOD : INK};white-space:nowrap;padding-left:12px">${i.match_score}/10</td>
          </tr></table>
          <div style="font-family:${SANS};font-size:13px;color:${SOFT};padding-top:2px">${esc(i.company || "Company not stated")}</div>
          ${extra}
          ${i.match_reason ? `<div style="font-family:${SANS};font-size:14px;line-height:1.5;color:${INK};padding-top:8px">${esc(i.match_reason)}</div>` : ""}
          ${i.url ? `<div style="padding-top:12px"><a href="${esc(i.url)}" style="font-family:${SANS};font-size:13px;color:${PAPER};background:${OXBLOOD};text-decoration:none;padding:8px 14px;border-radius:999px;display:inline-block">View the listing</a></div>` : ""}
        </td></tr>
      </table>
    </td></tr>`;

  const deadlineLine = (i: Item) =>
    i.deadline || i.deadline_text
      ? `<div style="font-family:${SANS};font-size:13px;font-weight:bold;color:${OXBLOOD};padding-top:6px">${esc(i.deadline ? deadlineLabel(i.deadline) : `Deadline: ${i.deadline_text}`)}</div>`
      : "";
  const statusLine = (i: Item) =>
    `<div style="font-family:${SANS};font-size:13px;color:${SOFT};padding-top:6px">${esc(STATUS_LABEL[i.status])}${
      i.status_changed_at ? ` since ${new Date(i.status_changed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""
    }. Worth a friendly follow-up email?</div>`;

  const section = (title: string, items: Item[], extra: (i: Item) => string) =>
    items.length
      ? `<tr><td style="font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${SOFT};padding:20px 0 10px 0">${title}</td></tr>${items.map((i) => card(i, extra(i))).join("")}`
      : "";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:${PAPER}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
    <tr><td style="font-family:${SANS};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${SOFT}">${esc(st.agent.name)} · casting digest</td></tr>
    <tr><td style="font-family:${SERIF};font-style:italic;font-size:34px;color:${INK};padding:4px 0 8px 0">${esc(st.client.name)}</td></tr>
    <tr><td style="font-family:${SANS};font-size:15px;line-height:1.5;color:${INK};padding-bottom:4px">${esc(intro)}</td></tr>
    ${section("Closing soon", sections.closing, deadlineLine)}
    ${section("New matches", sections.fresh, deadlineLine)}
    ${section("Time to follow up", sections.followUp, statusLine)}
    <tr><td style="padding:20px 0 6px 0"><a href="${site}/tracker" style="font-family:${SANS};font-size:14px;color:${OXBLOOD}">Open your tracker</a> &nbsp;·&nbsp; <a href="${site}/" style="font-family:${SANS};font-size:14px;color:${OXBLOOD}">See all matches</a></td></tr>
    <tr><td style="font-family:${SERIF};font-style:italic;font-size:16px;color:${OXBLOOD};padding:12px 0 24px 0">${esc(st.agent.catchphrase)}</td></tr>
  </table>
</td></tr></table></body></html>`;

  const textSection = (title: string, items: Item[], extra: (i: Item) => string) =>
    items.length
      ? `\n${title.toUpperCase()}\n${items
          .map((i) => `- ${i.title} (${i.company || "company not stated"}), ${i.match_score}/10${extra(i)}${i.url ? `\n  ${i.url}` : ""}`)
          .join("\n")}\n`
      : "";
  const textDeadline = (i: Item) => (i.deadline ? `. ${deadlineLabel(i.deadline)}` : i.deadline_text ? `. Deadline: ${i.deadline_text}` : "");
  const text = `${st.agent.name} casting digest for ${st.client.firstName}\n\n${intro}\n${textSection("Closing soon", sections.closing, textDeadline)}${textSection(
    "New matches",
    sections.fresh,
    textDeadline,
  )}${textSection("Time to follow up", sections.followUp, () => ". Applied a while ago, worth a follow-up?")}\nTracker: ${site}/tracker\n\n${st.agent.catchphrase}\n`;

  return { subject, html, text, isEmpty, counts };
}
