// Cloudflare Email Routing worker: receives mail sent to *@in.yourdomain.com, parses it,
// and posts it to the app's email webhook as JSON (same fields the webhook reads).
import PostalMime from "postal-mime";

interface Env {
  WEBHOOK_URL: string; // https://<app>/api/webhooks/email
  EMAIL_WEBHOOK_SECRET: string;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    // message.raw is single use: buffer it once.
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw);

    const headerLines = [
      parsed.messageId ? `Message-ID: ${parsed.messageId}` : "",
      parsed.date ? `Date: ${parsed.date}` : "",
    ].filter(Boolean);

    const body = {
      from: parsed.from?.address ? `${parsed.from.name ?? ""} <${parsed.from.address}>` : message.from,
      to: message.to,
      cc: (parsed.cc ?? []).map((a) => a.address).filter(Boolean).join(", "),
      envelope: JSON.stringify({ from: message.from, to: [message.to] }),
      subject: parsed.subject ?? "",
      text: parsed.text ?? "",
      html: parsed.html ?? "",
      headers: headerLines.join("\n"),
    };

    const res = await fetch(`${env.WEBHOOK_URL}?token=${encodeURIComponent(env.EMAIL_WEBHOOK_SECRET)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    // A failed delivery tells the sender's server to retry later instead of losing the mail.
    if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
  },
};
