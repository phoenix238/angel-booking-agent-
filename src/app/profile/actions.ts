"use server";

import { revalidatePath } from "next/cache";
import { runChatTurn } from "@/lib/agent-chat";
import { runAgentSearch, type Find } from "@/lib/agent-search";
import { friendlyApiError } from "@/lib/llm";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

export type ChatResult =
  | { ok: true; reply: string; learned: { id: string; fact: string }[]; options: string[]; search: string }
  | { ok: false; error: string };

export type SearchResult = { ok: true; message: string; finds: Find[] } | { ok: false; error: string };

export async function sendChatMessage(text: string): Promise<ChatResult> {
  await requireUser();
  const message = text.trim().slice(0, 4000);
  if (!message) return { ok: false, error: "Type a message first." };
  try {
    const turn = await runChatTurn(createAdminClient(), message);
    revalidatePath("/profile");
    return {
      ok: true,
      reply: turn.reply,
      learned: turn.learned.map((fact, i) => ({ id: turn.learnedIds[i], fact })).filter((f) => f.id),
      options: turn.options,
      search: turn.search,
    };
  } catch (e) {
    return { ok: false, error: friendlyApiError(e) };
  }
}

// Agent Angel searches the web, saves finds to Matches and posts them in the chat.
export async function findOpportunities(brief: string): Promise<SearchResult> {
  await requireUser();
  try {
    const result = await runAgentSearch(createAdminClient(), brief.trim().slice(0, 1000));
    revalidatePath("/");
    revalidatePath("/profile");
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: friendlyApiError(e) };
  }
}

// Removing a fact only switches it off, so scoring stops using it.
export async function setFactActive(id: string, active: boolean) {
  await requireUser();
  await createAdminClient().from("profile_facts").update({ active }).eq("id", id);
  revalidatePath("/profile");
}

export async function addFact(formData: FormData) {
  await requireUser();
  const fact = String(formData.get("fact") ?? "").trim().slice(0, 500);
  if (fact) await createAdminClient().from("profile_facts").insert({ fact, source: "manual" });
  revalidatePath("/profile");
}

export async function clearChat() {
  await requireUser();
  await createAdminClient().from("chat_messages").delete().gte("created_at", "1970-01-01");
  revalidatePath("/profile");
}

// "Watch on Instagram" on an Agent find: adds the account to the daily check.
export async function watchInstagram(handleInput: string): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  const { fetchIgAccount, getIgCreds } = await import("@/lib/instagram");
  const { normalizeHandle } = await import("@/lib/sources");
  const handle = normalizeHandle(handleInput);
  if (!handle) return { ok: false, message: "That does not look like an Instagram handle." };
  const db = createAdminClient();
  const creds = await getIgCreds(db);
  // When connected, make sure the account is real and readable before watching it.
  if (creds) {
    try {
      await fetchIgAccount(creds, handle);
    } catch {
      return { ok: false, message: `Couldn't find a public business or creator account called @${handle}` };
    }
  }
  const { error } = await db.from("sources").insert({ type: "INSTAGRAM_ACCOUNT", value: handle, handle, label: `@${handle}` });
  if (error && !error.message.includes("duplicate")) return { ok: false, message: error.message };
  revalidatePath("/settings");
  return { ok: true, message: creds ? `Watching @${handle}` : `Saved @${handle}, checked once Instagram is connected` };
}
