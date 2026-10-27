import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service role client. Bypasses RLS, so it must only ever run on the server,
// and callers must check the user (requireUser) or a shared secret first.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
