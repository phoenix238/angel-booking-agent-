"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { friendlyApiError } from "@/lib/llm";
import { draftProfileFromPage, fetchPublicPage, type ProfileDraft } from "@/lib/onboarding";
import { loadSettings, saveSettings, SettingsSchema, withCatchphrase } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { saveRegions } from "../settings/settings-actions";

export type ReadState = { draft?: ProfileDraft; url?: string; error?: string };

export async function readWebsite(_prev: ReadState, fd: FormData): Promise<ReadState> {
  await requireUser();
  const url = String(fd.get("url") ?? "").trim();
  if (!url) return { error: "Paste the link to your website first." };
  try {
    const db = createAdminClient();
    const page = await fetchPublicPage(url);
    return { draft: await draftProfileFromPage(await loadSettings(db), page), url: page.url };
  } catch (e) {
    return { error: friendlyApiError(e), url };
  }
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const lines = (fd: FormData, k: string) => str(fd, k).split("\n").map((l) => l.trim()).filter(Boolean);
const cells = (fd: FormData, k: string) => lines(fd, k).map((l) => l.split("|").map((c) => c.trim()));

export async function saveProfileStep(fd: FormData) {
  await requireUser();
  const db = createAdminClient();
  const st = await loadSettings(db);
  const next = SettingsSchema.safeParse({
    ...st,
    client: {
      ...st.client,
      name: str(fd, "name") || st.client.name,
      firstName: str(fd, "firstName") || st.client.firstName,
      pronouns: str(fd, "pronouns") || st.client.pronouns,
      summary: str(fd, "summary"),
      based: str(fd, "based"),
      disciplines: str(fd, "disciplines").split(",").map((d) => d.trim()).filter(Boolean),
      training: cells(fd, "training").map(([course = "", school = ""]) => ({ course, school })),
      credits: cells(fd, "credits").map(([show = "", role = "", where = "", year = ""]) => ({ show, role, where, year })),
      links: cells(fd, "links").map(([label = "", href = ""]) => ({ label, href })),
    },
    onboarding: { ...st.onboarding, questions: lines(fd, "questions").slice(0, 6) },
  });
  if (!next.success) redirect("/onboarding?step=1&error=profile");
  await saveSettings(db, next.data);
  const facts = lines(fd, "facts").slice(0, 40);
  if (facts.length) {
    const { data: have } = await db.from("profile_facts").select("fact").eq("active", true);
    const known = new Set((have ?? []).map((f) => (f.fact as string).toLowerCase()));
    const fresh = facts.filter((f) => !known.has(f.toLowerCase()));
    if (fresh.length) await db.from("profile_facts").insert(fresh.map((fact) => ({ fact, source: "website" })));
  }
  revalidatePath("/", "layout");
  redirect("/onboarding?step=2");
}

export async function saveRegionsStep(_prev: { ok?: string; error?: string }, fd: FormData): Promise<{ ok?: string; error?: string }> {
  await requireUser();
  const res = await saveRegions({}, fd);
  if (res.error) return res;
  redirect("/onboarding?step=3");
}

const WANT_PREFIXES = ["Looking for:", "Touring:", "Relocating:", "Cruise and ferry work:", "Deal-breakers:", "Availability:", "Most excited about:"];
const CHOICE = (v: string, yes: string, maybe: string, no: string) => (v === "yes" ? yes : v === "no" ? no : v === "maybe" ? maybe : "");

export async function saveWantsStep(fd: FormData) {
  await requireUser();
  const db = createAdminClient();
  const types = fd.getAll("type").map(String).filter(Boolean);
  const facts = [
    types.length ? `Looking for: ${types.join(", ")}.` : "",
    CHOICE(str(fd, "touring"), "Touring: happy to tour.", "Touring: open to touring depending on the job.", "Touring: prefers not to tour."),
    CHOICE(str(fd, "relocate"), "Relocating: happy to relocate for the right job.", "Relocating: open to it depending on the job.", "Relocating: prefers to stay where she is."),
    CHOICE(str(fd, "cruise"), "Cruise and ferry work: happy to consider it.", "Cruise and ferry work: open to short contracts only.", "Cruise and ferry work: not interested."),
    str(fd, "dealbreakers") && `Deal-breakers: ${str(fd, "dealbreakers")}`,
    str(fd, "availability") && `Availability: ${str(fd, "availability")}`,
    str(fd, "excited") && `Most excited about: ${str(fd, "excited")}`,
  ].filter(Boolean) as string[];

  // Re-running onboarding replaces the earlier answers instead of piling up duplicates.
  const { data: old } = await db.from("profile_facts").select("id, fact").eq("active", true);
  const oldIds = (old ?? []).filter((f) => WANT_PREFIXES.some((p) => (f.fact as string).startsWith(p))).map((f) => f.id as string);
  if (oldIds.length) await db.from("profile_facts").update({ active: false }).in("id", oldIds);
  if (facts.length) await db.from("profile_facts").insert(facts.map((fact) => ({ fact, source: "interview" })));

  const st = await loadSettings(db);
  await saveSettings(db, { ...st, onboarding: { ...st.onboarding, done: true } });
  revalidatePath("/", "layout");
  redirect("/onboarding?step=4");
}

// Step 4: Angel opens the chat with what she still wants to ask.
export async function startChatWithAngel() {
  await requireUser();
  const db = createAdminClient();
  const st = await loadSettings(db);
  const { count } = await db.from("chat_messages").select("id", { count: "exact", head: true });
  if (!count) {
    const qs = st.onboarding.questions;
    const text =
      `Thanks ${st.client.firstName}, I've read your website and noted where you can work and what you're after. ` +
      (qs.length ? `A few things I couldn't see on your page. ${qs.join(" ")} Shall we start with the first one?` : "What would you like to start with?");
    await db.from("chat_messages").insert({ role: "assistant", content: withCatchphrase(st, text) });
  }
  redirect("/profile");
}
