"use server";

import { revalidatePath } from "next/cache";
import { friendlyApiError } from "@/lib/llm";
import { runJob, snoozeJob } from "@/lib/routine";
import { loadSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

export async function scanRadar(): Promise<{ ok?: string; error?: string }> {
  await requireUser();
  try {
    const summary = await runJob(createAdminClient(), "radar", "manual");
    revalidatePath("/digest");
    revalidatePath("/");
    return { ok: summary };
  } catch (e) {
    return { error: friendlyApiError(e) };
  }
}

export async function refreshRecast(): Promise<{ ok?: string; error?: string }> {
  await requireUser();
  try {
    const summary = await runJob(createAdminClient(), "recast", "manual");
    revalidatePath("/digest");
    return { ok: summary };
  } catch (e) {
    return { error: friendlyApiError(e) };
  }
}

const KEYS = ["feeds", "mail", "radar", "recast"] as const;

// "Run now" on a routine job that is waiting for an OK.
export async function runRoutineJob(_prev: { ok?: string; error?: string }, fd: FormData): Promise<{ ok?: string; error?: string }> {
  await requireUser();
  const job = String(fd.get("job"));
  if (!KEYS.includes(job as (typeof KEYS)[number])) return { error: "Unknown job." };
  try {
    const summary = await runJob(createAdminClient(), job as (typeof KEYS)[number], "manual");
    revalidatePath("/digest");
    revalidatePath("/");
    return { ok: summary };
  } catch (e) {
    return { error: friendlyApiError(e) };
  }
}

export async function snoozeRoutineJob(fd: FormData) {
  await requireUser();
  const job = String(fd.get("job"));
  if (!KEYS.includes(job as (typeof KEYS)[number])) return;
  const db = createAdminClient();
  await snoozeJob(db, job as (typeof KEYS)[number], await loadSettings(db));
  revalidatePath("/digest");
  revalidatePath("/");
}
