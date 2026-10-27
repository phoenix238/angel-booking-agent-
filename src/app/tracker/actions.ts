"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { isStatus } from "@/lib/tracker";

function refresh() {
  revalidatePath("/");
  revalidatePath("/tracker");
  revalidatePath("/profile");
}

export async function setStatus(id: string, status: string) {
  await requireUser();
  if (!isStatus(status)) return;
  await createAdminClient()
    .from("auditions")
    .update({ status, status_changed_at: new Date().toISOString() })
    .eq("id", id);
  refresh();
}

// Form action used by the plain buttons on Matches and the tracker.
export async function setStatusForm(formData: FormData) {
  await setStatus(String(formData.get("id")), String(formData.get("status")));
}

export async function saveDetails(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 4000);
  const deadline = String(formData.get("deadline") ?? "");
  await createAdminClient()
    .from("auditions")
    .update({ notes: notes || null, deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null })
    .eq("id", id);
  refresh();
}
