import "server-only";
import nodemailer from "nodemailer";

// Sends through any SMTP account (e.g. Gmail with an app password). Nothing is
// sent until SMTP_HOST, SMTP_USER and SMTP_PASS are set.
export function mailerConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendMail(opts: { to: string[]; subject: string; html: string; text: string; fromName?: string }) {
  if (!mailerConfigured()) throw new Error("Email sending is not set up yet (SMTP settings missing).");
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: `"${(opts.fromName ?? "Casting agent").replace(/"/g, "")}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: opts.to.join(", "),
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}
