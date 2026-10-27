import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestItem, loadScoringContext, type ScoringContext } from "./ingest";
import { autoConfirm, baseDomain } from "./confirm";
import { analyseEmail, dedupeKey, detectConfirm, extractLinks, type Analysis } from "./newsletter";
import type { SourceRow } from "./sources";

// One place that turns an incoming email into a scored notice. Used by the inbound webhook
// and by the mailbox reader (Angel's own inbox).

export type IncomingEmail = {
  fromAddrs: string[];
  fromName?: string;
  toAddrs: string[];
  subject?: string;
  text?: string;
  html?: string;
  messageId?: string;
  date?: string | null;
  unsubscribeUrl?: string;
};

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const slugToLabel = (slug: string) => {
  const t = slug.replace(/[-_.]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Mailing list";
};

// Finds the mailing list an email belongs to: by the address it was sent to, then by sender.
// With `tagBase` (the mailbox's own address), an unknown plus tag or sender creates the list.
export async function findEmailSource(
  db: SupabaseClient,
  email: Pick<IncomingEmail, "fromAddrs" | "fromName" | "toAddrs" | "subject">,
  autoCreate: { mailbox: string } | null,
): Promise<SourceRow | null> {
  const { data } = await db.from("sources").select("*").eq("type", "EMAIL_LIST").eq("status", "active");
  const sources = (data ?? []) as SourceRow[];
  const to = new Set(email.toAddrs.map((a) => a.toLowerCase()));
  const from = new Set(email.fromAddrs.map((a) => a.toLowerCase()));
  const found =
    sources.find((s) => s.inbound_address && to.has(s.inbound_address.toLowerCase())) ?? sources.find((s) => from.has(s.value.toLowerCase()));
  if (found || !autoCreate) return found ?? null;

  // A list joined from the app waits as "pending:<name>" until its first email arrives.
  const pending = sources.filter((s) => s.value.startsWith("pending:"));
  if (pending.length) {
    const { data: sugg } = await db.from("list_suggestions").select("name, signup_url, source_id").eq("status", "joined").not("source_id", "is", null);
    const senderBase = email.fromAddrs[0] ? baseDomain(email.fromAddrs[0].split("@")[1] ?? "") : "";
    const hay = `${email.fromName ?? ""} ${email.subject ?? ""}`.toLowerCase();
    const hit = (sugg ?? []).find((g) => {
      if (!pending.some((p) => p.id === g.source_id)) return false;
      let host = "";
      try {
        host = baseDomain(new URL(g.signup_url as string).hostname);
      } catch {
        // bad stored URL
      }
      return (host && senderBase && host === senderBase) || ((g.name as string).length > 3 && hay.includes((g.name as string).toLowerCase()));
    });
    const match = hit && pending.find((p) => p.id === hit.source_id);
    if (match) return match;
  }

  const [mailLocal, mailDomain] = autoCreate.mailbox.toLowerCase().split("@");
  const tagged = email.toAddrs.map((a) => a.toLowerCase()).find((a) => {
    const m = a.match(/^([^+@]+)\+([^@]+)@(.+)$/);
    return m && m[1] === mailLocal && m[3] === mailDomain;
  });
  const sender = email.fromAddrs[0]?.toLowerCase();
  if (!tagged && !sender) return null;
  const label = tagged ? slugToLabel(tagged.split("+")[1].split("@")[0]) : email.fromName || sender!;
  const { data: created, error } = await db
    .from("sources")
    .insert({ type: "EMAIL_LIST", value: sender ?? tagged!, label, inbound_address: tagged ?? null })
    .select("*")
    .single();
  if (error) {
    // Already exists under another key (e.g. same sender): fall back to that one.
    const { data: again } = await db.from("sources").select("*").eq("type", "EMAIL_LIST").eq("value", sender ?? tagged!).maybeSingle();
    return (again as SourceRow | null) ?? null;
  }
  return created as SourceRow;
}

export type EmailResult = {
  kind: "newsletter" | "confirm" | "other" | "seen";
  items: number;
  scored: number;
  matches: number;
  duplicates: number;
};

const DAY = 86_400_000;

export async function ingestEmail(db: SupabaseClient, source: SourceRow, email: IncomingEmail, ctx?: ScoringContext): Promise<EmailResult> {
  const body = email.text?.trim() || htmlToText(email.html ?? "");
  const messageId =
    email.messageId?.trim() || createHash("sha256").update(`${email.fromAddrs.join(",")}|${email.subject}|${body.slice(0, 500)}`).digest("hex");
  const result: EmailResult = { kind: "newsletter", items: 0, scored: 0, matches: 0, duplicates: 0 };

  // Already read? A row marked 'retry' is one that failed part way and is picked up again.
  const { data: seen } = await db.from("emails").select("id, kind").eq("source_id", source.id).eq("message_id", messageId).maybeSingle();
  if (seen && seen.kind !== "retry") return { ...result, kind: "seen" };

  const context = ctx ?? (await loadScoringContext(db));
  const links = extractLinks(email.html ?? "", body);
  const subject = email.subject ?? "";
  const from = email.fromName ? `${email.fromName} <${email.fromAddrs[0] ?? ""}>` : (email.fromAddrs[0] ?? "");
  const confirmHref = detectConfirm(subject, links);
  const analysis: Analysis = confirmHref
    ? { kind: "confirm", summary: "Asks you to confirm a subscription.", confirm_url: confirmHref, items: [] }
    : await analyseEmail(context.st, { from, subject, body }, links);
  result.kind = analysis.kind;

  const row = {
    source_id: source.id,
    message_id: messageId,
    subject: subject.slice(0, 300),
    from_name: email.fromName ?? null,
    from_addr: email.fromAddrs[0] ?? null,
    received_at: email.date && !isNaN(new Date(email.date).getTime()) ? new Date(email.date).toISOString() : new Date().toISOString(),
    kind: analysis.kind,
    summary: analysis.summary.slice(0, 500),
    confirm_url: analysis.confirm_url || null,
    unsubscribe_url: email.unsubscribeUrl ?? null,
  };
  let emailId: string;
  if (seen) {
    emailId = seen.id as string;
    await db.from("emails").update(row).eq("id", emailId);
  } else {
    const { data: created, error } = await db.from("emails").insert(row).select("id").single();
    if (error || !created) throw new Error(`Could not save the email: ${error?.message}`);
    emailId = created.id as string;
  }

  if (analysis.kind === "confirm" && analysis.confirm_url) {
    if (context.st.inbox.autoConfirm) {
      const { data: sugg } = await db.from("list_suggestions").select("signup_url").eq("source_id", source.id).eq("status", "joined").maybeSingle();
      let signupHost: string | null = null;
      try {
        signupHost = sugg?.signup_url ? new URL(sugg.signup_url as string).hostname : null;
      } catch {
        // ignore a bad stored URL
      }
      const label = links.find((l) => l.href === analysis.confirm_url)?.label ?? "";
      const r = await autoConfirm(analysis.confirm_url, { label, senderDomain: email.fromAddrs[0]?.split("@")[1] ?? null, signupHost });
      await db
        .from("emails")
        .update({ confirm_status: r.status, confirm_note: r.note, handled: r.status === "auto_done", confirmed_at: r.status === "auto_done" ? new Date().toISOString() : null })
        .eq("id", emailId);
    } else {
      await db.from("emails").update({ confirm_status: "needs_click", confirm_note: "Automatic confirming is switched off." }).eq("id", emailId);
    }
  }

  if (analysis.kind === "newsletter") {
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    let failure: unknown = null;
    for (const [i, item] of analysis.items.entries()) {
      const key = dedupeKey(item.title, item.organisation);
      if (key) {
        const { data: dup } = await db.from("auditions").select("id").eq("dedupe_key", key).gte("created_at", since).limit(1);
        if (dup?.length) {
          result.duplicates++;
          continue;
        }
      }
      try {
        const outcome = await ingestItem(
          db,
          {
            sourceId: source.id,
            externalId: `${messageId}#${i}`,
            text: [item.title, item.organisation && `Organisation: ${item.organisation}`, item.deadline_text && `Deadline: ${item.deadline_text}`, item.description].filter(Boolean).join("\n"),
            url: item.url || null,
            datePosted: row.received_at,
            fallbackTitle: item.title.slice(0, 120),
            deadline: /^\d{4}-\d{2}-\d{2}$/.test(item.deadline_iso) ? item.deadline_iso : null,
            deadlineText: item.deadline_text || null,
            emailId,
            dedupeKey: key,
          },
          context,
        );
        result.items++;
        if (outcome === "match" || outcome === "no_match") result.scored++;
        if (outcome === "match") result.matches++;
      } catch (e) {
        failure = e; // keep going; the email is retried next time
      }
    }
    if (failure) {
      await db.from("emails").update({ kind: "retry", item_count: result.items, match_count: result.matches }).eq("id", emailId);
      throw failure;
    }
  }

  await db.from("emails").update({ item_count: result.items, match_count: result.matches }).eq("id", emailId);
  await db.from("sources").update({ last_fetched_at: new Date().toISOString() }).eq("id", source.id);
  // A list joined from the app starts as "pending:<name>"; the first real email tells us the sender.
  if (source.value.startsWith("pending:") && email.fromAddrs[0]) {
    await db.from("sources").update({ value: email.fromAddrs[0].toLowerCase() }).eq("id", source.id);
  }
  return result;
}
