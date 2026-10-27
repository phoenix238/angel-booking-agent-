import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSettings } from "./settings";

// The producer area. A creative project (e.g. the show) has plans under it (a festival
// run, a schools tour). Plans are rows with parent_id set; dates, funding and contacts
// hang off a plan. Rows are archived, never deleted, so history is kept.

export type Project = {
  id: string;
  name: string;
  summary: string;
  goal: string;
  funding_countries: string;
  focus: string;
  buyers_label: string;
  active: boolean;
  position: number;
  parent_id: string | null;
};

export async function loadProjects(db: SupabaseClient): Promise<Project[]> {
  const { data, error } = await db.from("projects").select("*").eq("active", true).order("position").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
}

// A new client starts with one creative project made from the defaults in settings.
export async function ensureProject(db: SupabaseClient): Promise<Project[]> {
  const existing = await loadProjects(db);
  if (topLevel(existing).length) return existing;
  const { count } = await db.from("projects").select("id", { count: "exact", head: true });
  if (count) return existing; // only archived ones exist: do not resurrect
  const st = await loadSettings(db);
  const { error } = await db.from("projects").insert({
    name: st.show.title,
    summary: st.show.summary,
    goal: st.show.festival,
    funding_countries: st.show.fundingCountries,
    position: 0,
  });
  if (error) throw new Error(error.message);
  return loadProjects(db);
}

export const topLevel = (all: Project[]) => all.filter((p) => !p.parent_id);
export const plansOf = (all: Project[], id: string) => all.filter((p) => p.parent_id === id);

export async function getProject(db: SupabaseClient, id: string): Promise<Project | null> {
  const { data } = await db.from("projects").select("*").eq("id", id).maybeSingle();
  return (data as Project | null) ?? null;
}

export type UpcomingDate = { id: string; title: string; due: string; url: string | null; project: string; parent: string | null };

// Dates still to come, across every active plan, for Picks and the chat.
export async function upcomingProjectDates(db: SupabaseClient, days = 21, now = new Date()): Promise<UpcomingDate[]> {
  const today = now.toISOString().slice(0, 10);
  const until = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const { data } = await db
    .from("show_tasks")
    .select("id, title, due, url, projects!inner(name, active, parent:parent_id(name))")
    .eq("done", false)
    .gte("due", today)
    .lte("due", until)
    .eq("projects.active", true)
    .order("due")
    .limit(20);
  type Row = { id: string; title: string; due: string; url: string | null; projects: { name: string; parent: { name: string } | null } };
  return ((data ?? []) as unknown as Row[]).map((t) => ({
    id: t.id,
    title: t.title,
    due: t.due,
    url: t.url,
    project: t.projects.name,
    parent: t.projects.parent?.name ?? null,
  }));
}
