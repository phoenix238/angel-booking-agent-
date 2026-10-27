"use server";

import { revalidatePath } from "next/cache";
import { connectInstagram, disconnectInstagram } from "@/lib/instagram";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

export type ConnectState = { ok?: string; error?: string };

export async function connectInstagramAction(_prev: ConnectState, fd: FormData): Promise<ConnectState> {
  await requireUser();
  const appId = String(fd.get("appId") ?? "").trim();
  const appSecret = String(fd.get("appSecret") ?? "").trim();
  const token = String(fd.get("token") ?? "").trim();
  if (!/^\d{5,}$/.test(appId)) return { error: "The App ID is a long number, found at the top of your app's dashboard." };
  if (!appSecret || !token) return { error: "Paste the App secret and the access token too." };
  try {
    const r = await connectInstagram(createAdminClient(), { appId, appSecret, token });
    revalidatePath("/settings");
    const until = new Date(r.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
    return { ok: `Connected as @${r.username}. This connection lasts until ${until}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function disconnectInstagramAction() {
  await requireUser();
  await disconnectInstagram(createAdminClient());
  revalidatePath("/settings");
}
