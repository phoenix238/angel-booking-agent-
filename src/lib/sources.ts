// Helpers for turning what the user types into stored source values.

export type SourceRow = {
  id: string;
  type: "INSTAGRAM_RSS" | "EMAIL_LIST" | "AGENT_SEARCH" | "INSTAGRAM_ACCOUNT";
  value: string;
  label: string | null;
  handle: string | null;
  inbound_address: string | null;
  status: "active" | "inactive";
  last_fetched_at: string | null;
  created_at: string;
};

// "@name", "name", "https://instagram.com/name/" -> "name"
export function normalizeHandle(input: string): string | null {
  const s = input.trim();
  const fromUrl = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1];
  const handle = (fromUrl ?? s).replace(/^@/, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle.toLowerCase() : null;
}

// Accepts an RSS.app feed ID, any RSS.app feed URL (XML or v1.1 JSON), or any
// other http(s) RSS/Atom URL. RSS.app URLs are normalised to the XML feed.
export function normalizeFeedUrl(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9]{8,}$/.test(s)) return `https://rss.app/feeds/${s}.xml`;
  const rssApp = s.match(/rss\.app\/feeds\/(?:v1\.1\/)?([A-Za-z0-9]+)(?:\.(?:xml|json))?/i);
  if (rssApp) return `https://rss.app/feeds/${rssApp[1]}.xml`;
  try {
    const url = new URL(s);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function inboundDomain() {
  return process.env.INBOUND_EMAIL_DOMAIN || "in.example.com";
}

// Where a mailing list should be subscribed. With Angel's own inbox connected (IMAP_USER) it is a
// plus address on that mailbox, e.g. "Spotlight Weekly" -> angel+spotlight-weekly@gmail.com.
export function makeInboundAddress(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "list";
  const mailbox = process.env.IMAP_USER;
  if (mailbox && mailbox.includes("@")) {
    const [local, domain] = mailbox.toLowerCase().split("@");
    return `${local}+${slug}@${domain}`;
  }
  const suffix = crypto.randomUUID().slice(0, 4);
  const local = process.env.INBOUND_EMAIL_LOCAL || "auditions";
  return `${local}+${slug}-${suffix}@${inboundDomain()}`.toLowerCase();
}

export function extractEmails(s: string | null | undefined): string[] {
  return (s?.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).map((e) => e.toLowerCase());
}
