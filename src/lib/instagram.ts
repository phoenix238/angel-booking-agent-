import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ingestItem, loadScoringContext, type IngestOutcome, type ScoringContext } from "./ingest";
import { deleteSecrets, getSecrets, setSecrets } from "./secrets";
import type { SourceRow } from "./sources";

// Reads public posts from Instagram business/creator accounts with the official
// Instagram Graph API "Business Discovery" endpoint (Instagram API with Facebook
// Login). The connection is made from Settings, Instagram: a short-lived token
// from the Graph API Explorer is swapped for a 60 day one and saved in app_secrets.
// IG_ACCESS_TOKEN / IG_USER_ID env vars still work as an override.

const GRAPH = "https://graph.facebook.com/v26.0";
const POSTS_PER_ACCOUNT = 12;
const KEYS = ["ig_access_token", "ig_user_id", "ig_username", "ig_expires_at"] as const;

export type IgCreds = { token: string; igUserId: string; username?: string; expiresAt?: string };

export async function getIgCreds(db: SupabaseClient): Promise<IgCreds | null> {
  if (process.env.IG_ACCESS_TOKEN && process.env.IG_USER_ID) {
    return { token: process.env.IG_ACCESS_TOKEN, igUserId: process.env.IG_USER_ID };
  }
  const s = await getSecrets(db, [...KEYS]);
  if (!s.ig_access_token || !s.ig_user_id) return null;
  return { token: s.ig_access_token, igUserId: s.ig_user_id, username: s.ig_username, expiresAt: s.ig_expires_at };
}

export class InstagramError extends Error {}

async function graph(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
  if (!res.ok || body.error) {
    const msg = body.error?.message ?? `HTTP ${res.status}`;
    // 190 = expired or invalid token
    throw new InstagramError(body.error?.code === 190 ? `The Instagram connection has expired or is invalid. Reconnect it in Settings. (${msg})` : msg);
  }
  return body;
}

const MediaSchema = z.object({
  id: z.string(),
  caption: z.string().optional(),
  permalink: z.string().optional(),
  timestamp: z.string().optional(),
  media_type: z.string().optional(),
});

const DiscoverySchema = z.object({
  business_discovery: z.object({
    username: z.string(),
    name: z.string().optional(),
    followers_count: z.number().optional(),
    media: z.object({ data: z.array(MediaSchema) }).optional(),
  }),
});

export type IgPost = z.infer<typeof MediaSchema>;
export type IgAccount = { username: string; name?: string; followers?: number; posts: IgPost[] };

export async function fetchIgAccount(creds: IgCreds, handle: string): Promise<IgAccount> {
  const fields = `business_discovery.username(${handle}){username,name,followers_count,media.limit(${POSTS_PER_ACCOUNT}){id,caption,permalink,timestamp,media_type}}`;
  const parsed = DiscoverySchema.safeParse(await graph(creds.igUserId, { fields, access_token: creds.token }));
  if (!parsed.success) throw new InstagramError(`Unexpected reply from Instagram for @${handle}`);
  const d = parsed.data.business_discovery;
  return { username: d.username, name: d.name, followers: d.followers_count, posts: d.media?.data ?? [] };
}

// Settings page: is Instagram connected, as whom, and until when.
export async function instagramStatus(
  db: SupabaseClient,
): Promise<{ state: "off" } | { state: "on"; username: string; expiresAt?: string } | { state: "error"; error: string }> {
  const creds = await getIgCreds(db);
  if (!creds) return { state: "off" };
  try {
    const body = z.object({ username: z.string() }).parse(await graph(creds.igUserId, { fields: "username", access_token: creds.token }));
    return { state: "on", username: body.username, expiresAt: creds.expiresAt };
  } catch (e) {
    return { state: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

// Swaps a short-lived Graph API Explorer token for a ~60 day token, finds the
// Instagram professional account linked to one of the user's Facebook Pages,
// and saves the connection.
export async function connectInstagram(
  db: SupabaseClient,
  input: { appId: string; appSecret: string; token: string },
): Promise<{ username: string; expiresAt: string }> {
  const exchanged = z
    .object({ access_token: z.string(), expires_in: z.number().optional() })
    .parse(
      await graph("oauth/access_token", {
        grant_type: "fb_exchange_token",
        client_id: input.appId,
        client_secret: input.appSecret,
        fb_exchange_token: input.token,
      }),
    );
  const token = exchanged.access_token;
  const expiresAt = new Date(Date.now() + (exchanged.expires_in ?? 60 * 86_400) * 1000).toISOString();

  const pages = z
    .object({
      data: z.array(
        z.object({
          name: z.string().optional(),
          instagram_business_account: z.object({ id: z.string(), username: z.string().optional() }).optional(),
        }),
      ),
    })
    .parse(await graph("me/accounts", { fields: "name,instagram_business_account{id,username}", access_token: token }));
  const linked = pages.data.find((p) => p.instagram_business_account)?.instagram_business_account;
  if (!linked) {
    throw new InstagramError(
      pages.data.length
        ? "Found your Facebook Page, but no Instagram professional account is linked to it. Link the Instagram account in the Page settings, then try again."
        : "No Facebook Pages were found for this token. Make sure you ticked pages_show_list when generating the token, and that you manage a Page.",
    );
  }
  await setSecrets(db, {
    ig_access_token: token,
    ig_user_id: linked.id,
    ig_username: linked.username ?? "",
    ig_expires_at: expiresAt,
  });
  return { username: linked.username ?? linked.id, expiresAt };
}

export async function disconnectInstagram(db: SupabaseClient) {
  await deleteSecrets(db, [...KEYS]);
}

export type IgReport = { sourceId: string; label: string; counts: Record<IngestOutcome | "failed", number>; error?: string };

export async function fetchIgSource(db: SupabaseClient, creds: IgCreds, source: SourceRow, ctx: ScoringContext): Promise<IgReport> {
  const counts: IgReport["counts"] = { skipped: 0, match: 0, no_match: 0, filtered: 0, failed: 0 };
  const label = `@${source.value}`;
  try {
    const account = await fetchIgAccount(creds, source.value);
    for (const post of account.posts) {
      const caption = post.caption?.trim();
      if (!caption) continue; // nothing to score in a caption-less post
      try {
        const outcome = await ingestItem(
          db,
          {
            sourceId: source.id,
            externalId: post.id,
            text: `Instagram post by @${account.username}${account.name ? ` (${account.name})` : ""}:\n\n${caption}`,
            url: post.permalink ?? `https://www.instagram.com/${account.username}/`,
            datePosted: post.timestamp ? new Date(post.timestamp).toISOString() : null,
            fallbackTitle: caption.split("\n")[0].slice(0, 120),
            prefilter: true,
          },
          ctx,
        );
        counts[outcome]++;
      } catch (e) {
        counts.failed++;
        console.error("[instagram] post failed:", label, post.id, e instanceof Error ? e.message : e);
      }
    }
    await db.from("sources").update({ last_fetched_at: new Date().toISOString() }).eq("id", source.id);
    return { sourceId: source.id, label, counts };
  } catch (e) {
    return { sourceId: source.id, label, counts, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchAllInstagram(db: SupabaseClient, ctx?: ScoringContext): Promise<IgReport[]> {
  const creds = await getIgCreds(db);
  if (!creds) return [];
  const { data, error } = await db.from("sources").select("*").eq("type", "INSTAGRAM_ACCOUNT").eq("status", "active");
  if (error) throw new Error(error.message);
  ctx ??= await loadScoringContext(db);
  const reports: IgReport[] = [];
  for (const source of (data ?? []) as SourceRow[]) reports.push(await fetchIgSource(db, creds, source, ctx));
  return reports;
}
