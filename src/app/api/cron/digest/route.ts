import { NextResponse, type NextRequest } from "next/server";
import { buildDigest } from "@/lib/digest";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import { loadSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Vercel Cron calls this daily (vercel.json) with "Authorization: Bearer <CRON_SECRET>".
// Quiet days are skipped so nobody gets an empty email.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const st = await loadSettings(db);
  // Off by default: the curated picks live in the app (Picks tab).
  if (!st.digest.enabled || st.digest.recipients.length === 0) {
    return NextResponse.json({ ok: true, skipped: "digest email off" });
  }
  const digest = await buildDigest(db);
  const to = st.digest.recipients;
  const itemCount = digest.counts.fresh + digest.counts.closing + digest.counts.followUp;

  if (digest.isEmpty) return NextResponse.json({ ok: true, skipped: "nothing new" });
  if (!mailerConfigured()) {
    return NextResponse.json({ ok: true, skipped: "email sending not set up", subject: digest.subject });
  }

  try {
    await sendMail({ to, subject: digest.subject, html: digest.html, text: digest.text, fromName: st.agent.name });
    await db.from("digest_runs").insert({ recipients: to.join(", "), item_count: itemCount, sent: true });
    return NextResponse.json({ ok: true, sent: to.length, subject: digest.subject });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.from("digest_runs").insert({ recipients: to.join(", "), item_count: itemCount, sent: false, error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
