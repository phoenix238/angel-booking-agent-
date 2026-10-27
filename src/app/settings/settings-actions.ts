"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SYSTEM_PROMPT } from "@/lib/llm";
import { loadSettings, placesPhrase, saveSettings, SettingsSchema, withPlaces, type Settings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

export type SaveState = { ok?: string; error?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
// "a | b | c" per line -> arrays of cells
const rows = (fd: FormData, k: string) =>
  str(fd, k)
    .split("\n")
    .map((l) => l.split("|").map((c) => c.trim()))
    .filter((cells) => cells.some(Boolean));

async function update(mutate: (s: Settings) => Settings, okMessage: string): Promise<SaveState> {
  await requireUser();
  const db = createAdminClient();
  const next = SettingsSchema.safeParse(mutate(await loadSettings(db)));
  if (!next.success) {
    const issue = next.error.issues[0];
    return { error: `Not saved: ${issue.path.join(" ")} ${issue.message}`.trim() };
  }
  await saveSettings(db, next.data);
  revalidatePath("/", "layout");
  return { ok: okMessage };
}

export async function saveClient(_prev: SaveState, fd: FormData): Promise<SaveState> {
  return update(
    (s) => ({
      ...s,
      client: {
        ...s.client,
        name: str(fd, "name"),
        firstName: str(fd, "firstName"),
        pronouns: str(fd, "pronouns") as Settings["client"]["pronouns"],
        summary: str(fd, "summary"),
        based: str(fd, "based"),
        portrait: str(fd, "portrait"),
        disciplines: str(fd, "disciplines").split(",").map((d) => d.trim()).filter(Boolean),
        training: rows(fd, "training").map(([course = "", school = ""]) => ({ course, school })),
        credits: rows(fd, "credits").map(([show = "", role = "", where = "", year = ""]) => ({ show, role, where, year })),
        links: rows(fd, "links").map(([label = "", href = ""]) => ({ label, href })),
      },
    }),
    "Client details saved.",
  );
}

export async function saveAgent(_prev: SaveState, fd: FormData): Promise<SaveState> {
  return update(
    (s) => ({
      ...s,
      agent: {
        ...s.agent,
        name: str(fd, "name"),
        catchphrase: str(fd, "catchphrase"),
        opening: str(fd, "opening"),
        tone: str(fd, "tone"),
        voice: str(fd, "voice"),
        learnTopics: str(fd, "learnTopics"),
        searchFocus: str(fd, "searchFocus"),
        placesToLook: str(fd, "placesToLook"),
        searchCity: str(fd, "searchCity"),
        searchCountry: str(fd, "searchCountry").toUpperCase(),
        searchTimezone: str(fd, "searchTimezone"),
      },
    }),
    "Agent saved. New chats and searches use this straight away.",
  );
}

export async function saveScoring(_prev: SaveState, fd: FormData): Promise<SaveState> {
  if (fd.get("reset") === "1") return update((s) => ({ ...s, scoringPrompt: SYSTEM_PROMPT, regions: { ...s.regions, places: ["UK"] } }), "Scoring prompt reset to the original (UK only).");
  return update((s) => ({ ...s, scoringPrompt: String(fd.get("scoringPrompt") ?? "").trim() }), "Scoring prompt saved. New notices use it from now on.");
}

export async function saveDigest(_prev: SaveState, fd: FormData): Promise<SaveState> {
  const recipients = str(fd, "recipients").split(/[,\s]+/).filter(Boolean);
  const bad = recipients.find((r) => !z.email().safeParse(r).success);
  if (bad) return { error: `"${bad}" is not an email address.` };
  return update(
    (s) => ({ ...s, digest: { enabled: fd.get("enabled") === "on", recipients } }),
    fd.get("enabled") === "on" ? "Daily email switched on." : "Daily email is off. Picks stay in the app.",
  );
}

export async function saveShowRadar(_prev: SaveState, fd: FormData): Promise<SaveState> {
  return update(
    (s) => ({
      ...s,
      radar: { enabled: fd.get("radarEnabled") === "on", venues: str(fd, "radarVenues") },
      recast: { enabled: fd.get("recastEnabled") === "on", scope: str(fd, "recastScope") },
    }),
    "Radar and recast watch saved.",
  );
}

export async function saveStudios(_prev: SaveState, fd: FormData): Promise<SaveState> {
  return update((s) => ({ ...s, studios: { skills: str(fd, "skills"), markets: str(fd, "markets") } }), "Studio map settings saved.");
}

const num = (fd: FormData, k: string, fallback: number) => {
  const n = Number(String(fd.get(k) ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
};

export async function saveCosts(_prev: SaveState, fd: FormData): Promise<SaveState> {
  return update(
    (s) => ({
      ...s,
      budget: { monthlyCapUsd: Math.max(0, num(fd, "cap", 0)) },
      models: {
        light: str(fd, "modelLight") as Settings["models"]["light"],
        chat: str(fd, "modelChat") as Settings["models"]["chat"],
        research: str(fd, "modelResearch") as Settings["models"]["research"],
      },
      filter: { enabled: fd.get("filterEnabled") === "on", extraWords: str(fd, "filterWords") },
    }),
    "Costs settings saved.",
  );
}

export async function saveRoutine(_prev: SaveState, fd: FormData): Promise<SaveState> {
  const job = (k: "feeds" | "mail" | "radar" | "recast", fallback: number) => ({
    everyDays: Math.max(1, Math.round(num(fd, `${k}Days`, fallback))),
    auto: fd.get(`${k}Auto`) === "on",
  });
  return update((s) => ({ ...s, routine: { feeds: job("feeds", 3), mail: job("mail", 2), radar: job("radar", 14), recast: job("recast", 30) } }), "Routine jobs saved.");
}

const PLACE_OPTIONS = ["UK", "Norway", "EU/EEA"];

export async function saveRegions(_prev: SaveState, fd: FormData): Promise<SaveState> {
  const chosen = PLACE_OPTIONS.filter((p) => fd.get(`place:${p}`) === "on");
  const other = str(fd, "otherPlaces").split(",").map((p) => p.trim()).filter(Boolean);
  const places = [...chosen, ...other];
  if (places.length === 0) return { error: "Pick at least one place." };
  let promptNote = "";
  const res = await update((s) => {
    const nextPrompt = withPlaces(s.scoringPrompt, places);
    if (nextPrompt === null) promptNote = " Your scoring prompt no longer has the line about places, so it was not changed. Add that line yourself.";
    return {
      ...s,
      regions: { places, note: str(fd, "regionNote") },
      scoringPrompt: nextPrompt ?? s.scoringPrompt,
      agent: { ...s.agent, placesToLook: placesPhrase(places) },
    };
  }, "Saved. The scoring prompt, searches and notes now use these places.");
  return res.ok ? { ok: `${res.ok}${promptNote}` } : res;
}
