"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { allowedEmails, createAuthClient, isAllowedEmail } from "@/lib/supabase/server";

export type LoginState = { sentTo?: string; error?: string };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  // Same reply either way, so the form does not reveal who is allowed in.
  const sent: LoginState = { sentTo: email };
  if (allowedEmails().length === 0) return { error: "No one is allowed in yet. Set ALLOWED_EMAILS in the settings." };
  if (!isAllowedEmail(email)) return sent;

  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const supabase = await createAuthClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: true },
  });
  if (error) return { error: /rate|seconds/i.test(error.message) ? "A link was sent very recently. Please wait a minute, then try again." : error.message };
  return sent;
}

export async function signOut() {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  redirect("/login");
}
