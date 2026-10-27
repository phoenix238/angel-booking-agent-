import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Server-only key/value secrets (app_secrets table, service role only).
// Values never go to the browser; pages show status only.

export async function getSecrets(db: SupabaseClient, keys: string[]): Promise<Record<string, string>> {
  const { data } = await db.from("app_secrets").select("key, value").in("key", keys);
  return Object.fromEntries((data ?? []).map((r) => [r.key as string, r.value as string]));
}

export async function setSecrets(db: SupabaseClient, values: Record<string, string>) {
  const rows = Object.entries(values).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
  const { error } = await db.from("app_secrets").upsert(rows);
  if (error) throw new Error(error.message);
}

export async function deleteSecrets(db: SupabaseClient, keys: string[]) {
  await db.from("app_secrets").delete().in("key", keys);
}
