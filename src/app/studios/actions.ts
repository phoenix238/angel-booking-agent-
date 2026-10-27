"use server";

import { revalidatePath } from "next/cache";
import { friendlyApiError } from "@/lib/llm";
import { runStudios } from "@/lib/studios";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

const STATUSES = ["to_contact", "contacted", "replied", "booked", "not_now"] as const;

export async function runStudiosAction(_prev: { ok?: string; error?: string }, fd: FormData): Promise<{ ok?: string; error?: string }> {
  await requireUser();
  try {
    const r = await runStudios(createAdminClient(), String(fd.get("focus") ?? "").trim().slice(0, 500));
    revalidatePath("/studios");
    return { ok: `${r.message} (${r.added} new studio${r.added === 1 ? "" : "s"} added)` };
  } catch (e) {
    return { error: friendlyApiError(e) };
  }
}

export async function setStudioStatus(id: string, status: string) {
  await requireUser();
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return;
  await createAdminClient().from("studios").update({ status }).eq("id", id);
  revalidatePath("/studios");
}
