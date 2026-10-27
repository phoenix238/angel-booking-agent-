"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { fetchIgAccount, getIgCreds } from "@/lib/instagram";
import { friendlyApiError } from "@/lib/llm";
import { runJob } from "@/lib/routine";
import { extractEmails, makeInboundAddress, normalizeFeedUrl, normalizeHandle } from "@/lib/sources";

export type FormState = { ok?: string; error?: string };

function dbError(message: string): FormState {
  return { error: message.includes("duplicate") ? "That source is already added." : message };
}

// With a feed link: read through RSS (e.g. RSS.app). Without one: watch the account
// directly through the Instagram connection (Settings, Instagram).
export async function addInstagram(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const handle = normalizeHandle(String(formData.get("handle") ?? ""));
  const feedInput = String(formData.get("feed") ?? "").trim();
  if (!handle) return { error: "That does not look like an Instagram handle." };

  if (!feedInput) {
    const db = createAdminClient();
    const creds = await getIgCreds(db);
    if (creds) {
      try {
        await fetchIgAccount(creds, handle);
      } catch {
        return { error: `Couldn't read @${handle}. Only public business and creator accounts can be watched.` };
      }
    }
    const { error } = await db
      .from("sources")
      .insert({ type: "INSTAGRAM_ACCOUNT", value: handle, handle, label: `@${handle}` });
    if (error) return dbError(error.message);
    revalidatePath("/settings");
    return creds
      ? { ok: `Watching @${handle}. Its posts are checked every morning.` }
      : { ok: `Saved @${handle}. It will be checked once Instagram is connected (see the Instagram section above), or add an RSS.app feed link instead.` };
  }

  const feed = normalizeFeedUrl(feedInput);
  if (!feed) return { error: "That feed link does not look right. Paste the RSS.app link (or its ID), or leave it empty." };
  const { error } = await createAdminClient()
    .from("sources")
    .insert({ type: "INSTAGRAM_RSS", value: feed, handle, label: `@${handle}` });
  if (error) return dbError(error.message);
  revalidatePath("/settings");
  return { ok: `Added @${handle} through its RSS feed.` };
}

export async function addRssFeed(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const feed = normalizeFeedUrl(String(formData.get("url") ?? ""));
  const label = String(formData.get("label") ?? "").trim();
  if (!feed) return { error: "That does not look like a feed link." };

  const { error } = await createAdminClient()
    .from("sources")
    .insert({ type: "INSTAGRAM_RSS", value: feed, label: label || new URL(feed).hostname });
  if (error) return dbError(error.message);
  revalidatePath("/settings");
  return { ok: "Feed added." };
}

export async function addEmailList(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const label = String(formData.get("label") ?? "").trim();
  const sender = extractEmails(String(formData.get("sender") ?? ""))[0];
  if (!label) return { error: "Give the list a name." };

  const inbound = makeInboundAddress(label);
  const { error } = await createAdminClient()
    .from("sources")
    .insert({ type: "EMAIL_LIST", value: sender ?? inbound, label, inbound_address: inbound });
  if (error) return dbError(error.message);
  revalidatePath("/settings");
  return { ok: `Subscribe to "${label}" with ${inbound}` };
}

export async function toggleSource(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  const next = formData.get("status") === "active" ? "inactive" : "active";
  await createAdminClient().from("sources").update({ status: next }).eq("id", id);
  revalidatePath("/settings");
}

// Removes the source only. Matches already found from it stay on the dashboard.
export async function deleteSource(formData: FormData) {
  await requireUser();
  await createAdminClient().from("sources").delete().eq("id", String(formData.get("id")));
  revalidatePath("/settings");
}

export async function runFetchNow(): Promise<FormState> {
  await requireUser();
  try {
    const summary = await runJob(createAdminClient(), "feeds", "manual");
    revalidatePath("/");
    revalidatePath("/settings");
    revalidatePath("/digest");
    return { ok: summary };
  } catch (e) {
    return { error: friendlyApiError(e) };
  }
}
