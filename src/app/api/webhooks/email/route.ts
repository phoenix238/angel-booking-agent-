import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findEmailSource, ingestEmail } from "@/lib/email-ingest";
import { angelAddress } from "@/lib/inbound";
import { extractEmails } from "@/lib/sources";

export const maxDuration = 60;

// SendGrid Inbound Parse posts multipart/form-data and does not sign requests,
// so the webhook URL carries a secret: /api/webhooks/email?token=<EMAIL_WEBHOOK_SECRET>
// Also accepts JSON with the same field names, handy for testing with curl.

function tokenOk(given: string | null) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readFields(req: NextRequest): Promise<Record<string, string>> {
  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json();
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? "")]));
  }
  const form = await req.formData();
  const out: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") out[k] = v;
  });
  return out;
}

export async function POST(req: NextRequest) {
  if (!tokenOk(req.nextUrl.searchParams.get("token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const f = await readFields(req);
  let envelope: { to?: string[]; from?: string } = {};
  try {
    envelope = f.envelope ? JSON.parse(f.envelope) : {};
  } catch {}

  const toAddrs = new Set([...extractEmails(f.to), ...extractEmails(f.cc), ...(envelope.to ?? []).flatMap(extractEmails)]);
  const fromAddrs = new Set([...extractEmails(f.from), ...extractEmails(envelope.from)]);

  const db = createAdminClient();
  const email = {
    fromAddrs: [...fromAddrs],
    toAddrs: [...toAddrs],
    subject: f.subject,
    text: f.text,
    html: f.html,
    messageId: f.headers?.match(/^Message-ID:\s*(.+)$/im)?.[1],
    date: f.headers?.match(/^Date:\s*(.+)$/im)?.[1],
  };
  const source = await findEmailSource(db, email, { mailbox: angelAddress() ?? "angel@example.invalid" });

  // Always 200 for unknown senders so SendGrid does not keep retrying.
  if (!source) return NextResponse.json({ ok: true, ignored: "no matching active email source" });

  const result = await ingestEmail(db, source, email);
  return NextResponse.json({ ok: true, source: source.label ?? source.value, ...result });
}
