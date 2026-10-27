import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkInbox, inboxConfigured } from "./mailbox";
import { runRadar } from "./radar";
import { runRecast } from "./recast";
import { fetchEverything } from "./rss";
import type { Settings } from "./settings";

// Routine jobs ("request mode"). By default nothing paid runs on its own: when a job is
// due (not run for its interval) the app asks, and one tap runs it. A job can be switched
// to run automatically in Settings.

export type JobKey = "feeds" | "mail" | "radar" | "recast";

export const JOBS: Record<JobKey, { label: string; blurb: string; cost: string }> = {
  feeds: {
    label: "Check feeds and Instagram",
    blurb: "Reads your feeds and watched Instagram accounts and scores anything new.",
    cost: "usually pennies",
  },
  mail: {
    label: "Check Angel's inbox",
    blurb: "Reads casting newsletters sent to Angel's own inbox and scores them.",
    cost: "usually pennies",
  },
  radar: {
    label: "Scan for newly announced shows",
    blurb: "Looks for actor-musician productions announced before casting opens.",
    cost: "about 50p",
  },
  recast: {
    label: "Refresh the recast watch",
    blurb: "Updates cast change dates and the forecast windows.",
    cost: "about 50p",
  },
};

export type JobStatus = {
  key: JobKey;
  label: string;
  blurb: string;
  cost: string;
  everyDays: number;
  auto: boolean;
  enabled: boolean;
  lastRanAt: string | null;
  daysAgo: number | null;
  due: boolean;
};

const DAY = 86_400_000;

function isEnabled(key: JobKey, st: Settings) {
  if (key === "mail") return inboxConfigured();
  if (key === "radar") return st.radar.enabled;
  if (key === "recast") return st.recast.enabled;
  return true;
}

export async function jobStatuses(db: SupabaseClient, st: Settings, now = new Date()): Promise<JobStatus[]> {
  const { data } = await db.from("job_runs").select("job, ran_at").order("ran_at", { ascending: false }).limit(200);
  const latest = new Map<string, string>();
  for (const r of data ?? []) if (!latest.has(r.job as string)) latest.set(r.job as string, r.ran_at as string);

  return (Object.keys(JOBS) as JobKey[]).map((key) => {
    const cfg = st.routine[key];
    const last = latest.get(key) ?? null;
    const daysAgo = last ? Math.floor((now.getTime() - Date.parse(last)) / DAY) : null;
    const enabled = isEnabled(key, st);
    return {
      key,
      ...JOBS[key],
      everyDays: cfg.everyDays,
      auto: cfg.auto,
      enabled,
      lastRanAt: last,
      daysAgo,
      due: enabled && (last === null || now.getTime() - Date.parse(last) >= cfg.everyDays * DAY),
    };
  });
}

export async function logJob(db: SupabaseClient, job: JobKey, trigger: "manual" | "cron", result: string) {
  await db.from("job_runs").insert({ job, trigger, result: result.slice(0, 500) });
}

// Runs one routine job and records it. Throws if the work itself fails (then it stays due).
export async function runJob(db: SupabaseClient, job: JobKey, trigger: "manual" | "cron"): Promise<string> {
  let summary: string;
  if (job === "feeds") {
    const reports = await fetchEverything(db);
    const sum = (k: "match" | "no_match" | "filtered" | "failed") => reports.reduce((n, r) => n + r.counts[k], 0);
    const failed = reports.filter((r) => r.error);
    summary = `Checked ${reports.length} source${reports.length === 1 ? "" : "s"}: ${sum("match") + sum("no_match")} new scored, ${sum("match")} matches, ${sum("filtered")} skipped by the free filter.`;
    if (sum("failed")) summary += ` ${sum("failed")} could not be scored and will be retried.`;
    if (failed.length) summary += ` Could not read: ${failed.map((f) => `${f.label} (${f.error})`).join("; ")}.`;
  } else if (job === "mail") {
    const r = await checkInbox(db);
    summary = r.read
      ? `Read ${r.read} email${r.read === 1 ? "" : "s"}: ${r.scored} opportunities scored, ${r.matches} matches${r.newLists ? `, ${r.newLists} new list${r.newLists === 1 ? "" : "s"} added` : ""}.${r.confirm ? ` ${r.confirm} need${r.confirm === 1 ? "s" : ""} you to confirm a subscription: see the Emails tab.` : ""}`
      : "The inbox was empty.";
    if (r.left) summary += ` ${r.left} left in the inbox to try again.`;
  } else if (job === "radar") {
    const r = await runRadar(db);
    summary = r.found
      ? `Found ${r.found} newly announced production${r.found === 1 ? "" : "s"}, ${r.matches} a strong fit.${r.skipped ? ` ${r.skipped} already known.` : ""}`
      : "No new actor-musician productions announced since the last scan.";
  } else {
    const r = await runRecast(db);
    summary = `Checked ${r.found} shows and tours. ${r.withForecast} have a forecast window.`;
  }
  await logJob(db, job, trigger, summary);
  return summary;
}

// "Ask again in a week": records a put-off so the job is not due again for 7 days.
export async function snoozeJob(db: SupabaseClient, job: JobKey, st: Settings, days = 7) {
  const ranAt = new Date(Date.now() + days * DAY - st.routine[job].everyDays * DAY).toISOString();
  await db.from("job_runs").insert({ job, trigger: "snooze", ran_at: ranAt, result: `Put off for ${days} days` });
}

// Used by the cron routes: run only if the job is set to automatic and is due.
export async function runIfAuto(db: SupabaseClient, st: Settings, job: JobKey): Promise<{ ok: true; skipped?: string; summary?: string }> {
  if (!st.routine[job].auto) return { ok: true, skipped: "request mode (asks first)" };
  const status = (await jobStatuses(db, st)).find((s) => s.key === job);
  if (!status?.enabled) return { ok: true, skipped: "switched off" };
  if (!status.due) return { ok: true, skipped: "not due yet" };
  return { ok: true, summary: await runJob(db, job, "cron") };
}
