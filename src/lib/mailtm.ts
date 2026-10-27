import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadScoringContext } from "./ingest";
import { processParsed, type InboxResult } from "./mailbox";

// Stopgap inbox on mail.tm (a free disposable mailbox with a web API instead of IMAP). Set
// MAILTM_USER (the address) and MAILTM_PASS. It can vanish without notice, so replace it with a
// permanent address (ANGEL_EMAIL / IMAP_USER) before building up lists you want to keep.

const API = "https://api.mail.tm";
const MAX_PER_RUN = 50;
const TIME_BUDGET_MS = 240_000;

export const mailTmConfigured = () => Boolean(process.env.MAILTM_USER && process.env.MAILTM_PASS);

async function api<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  if (!res.ok) throw new Error(`mail.tm ${path} answered ${res.status}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export async function checkMailTm(db: SupabaseClient): Promise<InboxResult> {
  const user = process.env.MAILTM_USER!;
  const { token } = await api<{ token: string }>("/token", null, { method: "POST", body: JSON.stringify({ address: user, password: process.env.MAILTM_PASS }) });
  const { simpleParser } = await import("mailparser");
  const result: InboxResult = { read: 0, matches: 0, scored: 0, confirm: 0, skipped: 0, left: 0, newLists: 0 };
  const started = Date.now();
  const ctx = await loadScoringContext(db);
  const list = await api<{ "hydra:member": { id: string }[] }>("/messages?page=1", token);
  const ids = list["hydra:member"].slice(0, MAX_PER_RUN).map((m) => m.id);
  for (const id of ids) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      result.left += ids.length - result.read - result.skipped - result.left;
      break;
    }
    try {
      const src = await api<{ data: string }>(`/sources/${id}`, token);
      const parsed = await simpleParser(src.data);
      const addrs = (a: typeof parsed.from) => (a ? a.value.map((v) => (v.address ?? "").toLowerCase()).filter(Boolean) : []);
      const toOf = (a: typeof parsed.to) => (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value.map((v) => (v.address ?? "").toLowerCase()));
      const unsub = parsed.headerLines.find((l) => l.key === "list-unsubscribe")?.line.match(/<(https?:\/\/[^>]+)>/)?.[1];
      const ok = await processParsed(
        db,
        ctx,
        user,
        {
          fromAddrs: addrs(parsed.from),
          fromName: parsed.from?.value[0]?.name,
          toAddrs: [...toOf(parsed.to), ...toOf(parsed.cc)],
          subject: parsed.subject,
          text: parsed.text,
          html: typeof parsed.html === "string" ? parsed.html : undefined,
          messageId: parsed.messageId,
          date: parsed.date?.toISOString() ?? null,
          unsubscribeUrl: unsub,
        },
        result,
      );
      if (ok) await api(`/messages/${id}`, token, { method: "DELETE" });
      else result.left++;
    } catch (e) {
      result.left++;
      console.error("[mailtm] message failed:", id, e instanceof Error ? e.message : e);
    }
  }
  return result;
}
