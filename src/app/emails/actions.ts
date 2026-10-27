"use server";

import { revalidatePath } from "next/cache";
import { angelAddress, slugOf } from "@/lib/inbound";
import { findLists } from "@/lib/lists";
import { friendlyApiError } from "@/lib/llm";
import { loadSettings, saveSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function findListsAction(_prev: { ok?: string; error?: string }, fd: FormData): Promise<{ ok?: string; error?: string }> {
  await requireUser();
  try {
    const r = await findLists(createAdminClient(), String(fd.get("focus") ?? "").trim().slice(0, 300));
    revalidatePath("/emails");
    return { ok: `${r.message} (${r.added} new lists${r.dropped ? `, ${r.dropped} dropped because their sign-up page could not be checked` : ""})` };
  } catch (e) {
    return { error: friendlyApiError(e) };
  }
}

export type JoinArgs = { suggestionId?: string; name?: string; url?: string; organisation?: string };

// "Join": reserves a place for the list so its first email is recognised. Angel cannot fill in
// someone else's sign-up form, so the person pastes Angel's address there (the page copies it).
export async function joinList(args: JoinArgs): Promise<{ ok?: true; address?: string; error?: string }> {
  await requireUser();
  const address = angelAddress();
  if (!address) return { error: "Angel's email address is not set up yet." };
  const db = createAdminClient();

  let id = args.suggestionId && UUID.test(args.suggestionId) ? args.suggestionId : null;
  let name = args.name?.trim() ?? "";
  if (!id) {
    // A list found in the chat: make sure it has a suggestion row.
    if (!args.url || !/^https?:\/\//.test(args.url) || !name) return { error: "That list is missing its name or sign-up page." };
    const { data } = await db
      .from("list_suggestions")
      .upsert({ name, organisation: args.organisation ?? null, signup_url: args.url, kind: "casting" }, { onConflict: "signup_url" })
      .select("id")
      .single();
    id = (data?.id as string | undefined) ?? null;
    if (!id) return { error: "Could not save that list." };
  }
  const { data: row } = await db.from("list_suggestions").select("name, status, source_id").eq("id", id).single();
  if (!row) return { error: "That list could not be found." };
  name = row.name as string;
  if (row.status === "joined" && row.source_id) return { ok: true, address };

  const slug = slugOf(name);
  let source = null as { id: string } | null;
  for (const suffix of ["", "-2", "-3", "-4"]) {
    const ins = await db.from("sources").insert({ type: "EMAIL_LIST", value: `pending:${slug}${suffix}`, label: name }).select("id").single();
    if (!ins.error) {
      source = ins.data;
      break;
    }
  }
  if (!source) return { error: "Could not set up that list." };
  await db.from("list_suggestions").update({ status: "joined", source_id: source.id }).eq("id", id);
  revalidatePath("/emails");
  return { ok: true, address };
}

export async function dismissSuggestion(fd: FormData) {
  await requireUser();
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  await createAdminClient().from("list_suggestions").update({ status: "dismissed" }).eq("id", id).eq("status", "suggested");
  revalidatePath("/emails");
}

export async function markConfirmDone(fd: FormData) {
  await requireUser();
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  await createAdminClient().from("emails").update({ handled: true, confirmed_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/emails");
}

// Per person: adds or removes the signed in user's own email from the digest recipients.
export async function setMyDigest(fd: FormData) {
  const user = await requireUser();
  const email = (user.email ?? "").toLowerCase();
  if (!email) return;
  const on = fd.get("on") === "true";
  const db = createAdminClient();
  const st = await loadSettings(db);
  const others = st.digest.recipients.filter((r) => r.toLowerCase() !== email);
  const recipients = on ? [...others, email] : others;
  await saveSettings(db, { ...st, digest: { enabled: recipients.length > 0, recipients } });
  revalidatePath("/emails");
  revalidatePath("/settings");
  revalidatePath("/digest");
}

export async function toggleAutoConfirm(fd: FormData) {
  await requireUser();
  const db = createAdminClient();
  const st = await loadSettings(db);
  await saveSettings(db, { ...st, inbox: { ...st.inbox, autoConfirm: fd.get("on") === "true" } });
  revalidatePath("/emails");
}
