import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AddressObject } from "mailparser";
import { findEmailSource, ingestEmail, type IncomingEmail } from "./email-ingest";
import { loadScoringContext } from "./ingest";
import { checkMailTm, mailTmConfigured } from "./mailtm";

// Angel's own inbox. A dedicated mailbox (IMAP_USER / IMAP_PASS, never the owner's everyday
// one) that mailing lists are subscribed to with plus addresses, e.g. angel+spotlight@gmail.com.
// The reader scores each message, then files it under "Processed" so the inbox stays empty.
// It reads at most MAX_PER_RUN messages and only moves a message after it ingested cleanly.

const MAX_PER_RUN = 50;
const TIME_BUDGET_MS = 240_000;
// Mail from the provider itself (security alerts, forwarding confirmations) is left alone.
const SYSTEM_SENDER = /@(accounts\.)?google\.com$|@mail\.google\.com$|^mailer-daemon@/i;

// The https link from a List-Unsubscribe header ("<mailto:x>, <https://...>"), if there is one.
function unsubscribeFrom(lines: readonly { key: string; line: string }[]): string | undefined {
  const line = lines.find((l) => l.key === "list-unsubscribe")?.line ?? "";
  return line.match(/<(https?:\/\/[^>]+)>/)?.[1];
}

export function inboxConfigured() {
  return mailTmConfigured() || Boolean(process.env.IMAP_USER && process.env.IMAP_PASS);
}

export type InboxResult = { read: number; matches: number; scored: number; confirm: number; skipped: number; left: number; newLists: number };

const addrs = (a: AddressObject | AddressObject[] | undefined): string[] =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value.map((v) => (v.address ?? "").toLowerCase()).filter(Boolean));


export type ParsedEmail = IncomingEmail;

// Shared by every reader (IMAP and mail.tm). Returns false when the message is not for a known
// list, so the caller leaves it where it is.
export async function processParsed(
  db: SupabaseClient,
  ctx: Awaited<ReturnType<typeof loadScoringContext>>,
  mailbox: string,
  email: ParsedEmail,
  result: InboxResult,
): Promise<boolean> {
  const before = await db.from("sources").select("id", { count: "exact", head: true }).eq("type", "EMAIL_LIST");
  const source = await findEmailSource(db, email, { mailbox });
  if (!source) return false;
  const after = await db.from("sources").select("id", { count: "exact", head: true }).eq("type", "EMAIL_LIST");
  if ((after.count ?? 0) > (before.count ?? 0)) result.newLists++;
  const r = await ingestEmail(db, source, email, ctx);
  if (r.kind === "seen") {
    result.skipped++;
  } else {
    result.read++;
    result.scored += r.scored;
    result.matches += r.matches;
    if (r.kind === "confirm") result.confirm++;
  }
  return true;
}

export async function checkInbox(db: SupabaseClient): Promise<InboxResult> {
  if (mailTmConfigured()) return checkMailTm(db);
  if (!inboxConfigured()) throw new Error("Angel's inbox is not connected yet. See Settings, Sources, Mailing list inbox.");
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");
  const user = process.env.IMAP_USER!;
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass: process.env.IMAP_PASS! },
    logger: false,
  });
  const result: InboxResult = { read: 0, matches: 0, scored: 0, confirm: 0, skipped: 0, left: 0, newLists: 0 };
  const started = Date.now();
  const ctx = await loadScoringContext(db);
  await client.connect();
  try {
    try {
      await client.mailboxCreate("Processed");
    } catch {
      // already exists
    }
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = ((await client.search({ all: true }, { uid: true })) || []).slice(0, MAX_PER_RUN);
      for (const uid of uids) {
        if (Date.now() - started > TIME_BUDGET_MS) {
          result.left += uids.length - result.read - result.left;
          break;
        }
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || !msg.source) {
            result.left++;
            continue;
          }
          const parsed = await simpleParser(msg.source);
          const fromAddrs = addrs(parsed.from);
          if (fromAddrs.some((a) => SYSTEM_SENDER.test(a))) {
            result.left++;
            continue;
          }
          const delivered = parsed.headers.get("delivered-to");
          const deliveredList = (Array.isArray(delivered) ? delivered : [delivered]).filter((d): d is string => typeof d === "string");
          const toAddrs = [...addrs(parsed.to), ...addrs(parsed.cc), ...deliveredList].map((a) => a.toLowerCase());
          const email = {
            fromAddrs,
            fromName: parsed.from?.value[0]?.name,
            toAddrs,
            subject: parsed.subject,
            text: parsed.text,
            html: typeof parsed.html === "string" ? parsed.html : undefined,
            messageId: parsed.messageId,
            date: parsed.date?.toISOString() ?? null,
            unsubscribeUrl: unsubscribeFrom(parsed.headerLines),
          };
          if (!(await processParsed(db, ctx, user, email, result))) {
            result.left++;
            continue;
          }
          await client.messageMove(String(uid), "Processed", { uid: true });
        } catch (e) {
          // Leave the message where it is so the next check retries it.
          result.left++;
          console.error("[mailbox] message failed:", uid, e instanceof Error ? e.message : e);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return result;
}
