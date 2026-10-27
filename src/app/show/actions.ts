"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyApiError } from "@/lib/llm";
import { runProducer } from "@/lib/producer";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

const STATUSES = ["to_contact", "contacted", "replied", "booked", "not_now"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh() {
  revalidatePath("/show");
  revalidatePath("/digest");
  revalidatePath("/");
}

export async function runProducerAction(_prev: { ok?: string; error?: string }, fd: FormData): Promise<{ ok?: string; error?: string }> {
  await requireUser();
  const projectId = String(fd.get("projectId") ?? "");
  if (!UUID.test(projectId)) return { error: "Pick a project first." };
  try {
    const r = await runProducer(createAdminClient(), projectId, String(fd.get("focus") ?? "").trim().slice(0, 500));
    refresh();
    return { ok: `${r.message} (${r.dates} dates, ${r.funding} funding leads, ${r.presenters} contacts)` };
  } catch (e) {
    return { error: friendlyApiError(e) };
  }
}

const field = (fd: FormData, k: string, max = 600) => String(fd.get(k) ?? "").trim().slice(0, max);

export async function createProject(fd: FormData) {
  await requireUser();
  const name = field(fd, "name", 120);
  if (!name) return;
  const db = createAdminClient();
  const parentRaw = String(fd.get("parentId") ?? "");
  const parentId = UUID.test(parentRaw) ? parentRaw : null;
  const { count } = await db.from("projects").select("id", { count: "exact", head: true });
  const { data, error } = await db
    .from("projects")
    .insert({
      parent_id: parentId,
      name,
      summary: field(fd, "summary", 1200),
      goal: field(fd, "goal", 200),
      funding_countries: field(fd, "fundingCountries", 200),
      focus: field(fd, "focus", 1200),
      buyers_label: field(fd, "buyersLabel", 80) || "Programmers to invite",
      position: count ?? 0,
    })
    .select("id")
    .single();
  if (error || !data) return;
  refresh();
  redirect(parentId ? `/show?p=${parentId}&plan=${data.id}` : `/show?p=${data.id}`);
}

export async function updateProject(fd: FormData) {
  await requireUser();
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const name = field(fd, "name", 120);
  if (!name) return;
  await createAdminClient()
    .from("projects")
    .update({
      name,
      summary: field(fd, "summary", 1200),
      goal: field(fd, "goal", 200),
      funding_countries: field(fd, "fundingCountries", 200),
      focus: field(fd, "focus", 1200),
      buyers_label: field(fd, "buyersLabel", 80) || "Programmers to invite",
    })
    .eq("id", id);
  refresh();
}

// Archive, never delete: dates, funding and contacts are kept. Archiving a creative
// project archives its plans too.
export async function archiveProject(fd: FormData) {
  await requireUser();
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const db = createAdminClient();
  const { data: row } = await db.from("projects").select("parent_id").eq("id", id).maybeSingle();
  await db.from("projects").update({ active: false }).eq("id", id);
  await db.from("projects").update({ active: false }).eq("parent_id", id);
  refresh();
  redirect(row?.parent_id ? `/show?p=${row.parent_id}` : "/show");
}

export async function toggleTask(fd: FormData) {
  await requireUser();
  await createAdminClient().from("show_tasks").update({ done: fd.get("done") !== "true" }).eq("id", String(fd.get("id")));
  refresh();
}

export async function setPresenterStatus(id: string, status: string) {
  await requireUser();
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return;
  await createAdminClient().from("presenters").update({ status }).eq("id", id);
  revalidatePath("/show");
}

export async function addTask(fd: FormData) {
  await requireUser();
  const projectId = String(fd.get("projectId") ?? "");
  const title = field(fd, "title", 200);
  const due = field(fd, "due", 10);
  if (!UUID.test(projectId) || !title) return;
  await createAdminClient()
    .from("show_tasks")
    .upsert({ project_id: projectId, title, due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null }, { onConflict: "project_id,title", ignoreDuplicates: true });
  refresh();
}
