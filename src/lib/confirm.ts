import "server-only";
import { assertPublicUrl } from "./onboarding";

// Angel confirms a newsletter subscription by opening the confirmation link herself, but only
// when it is clearly safe: https, on the company's own site or a known mailing service, a plain
// GET, and never anything that looks like unsubscribing. Anything else waits for a person.

// Mailing services whose confirmation links live on their own domain, not the company's.
const ESP_DOMAINS = [
  "list-manage.com", "mailchi.mp", "mailchimp.com", "sendgrid.net", "mailerlite.com", "mlsend.com", "substack.com", "beehiiv.com",
  "convertkit.com", "kit.com", "ck.page", "hubspot.com", "hs-sites.com", "hubspotemail.net", "klaviyo.com", "constantcontact.com",
  "cmail19.com", "cmail20.com", "createsend.com", "sendibt.com", "brevo.com", "sendinblue.com", "activehosted.com", "mailgun.org",
  "campaignmonitor.com", "emailoctopus.com", "buttondown.email", "ghost.io", "ghost.org", "flodesk.com", "moosend.com", "getresponse.com",
];

const SECOND_LEVEL = new Set(["co", "org", "ac", "gov", "com", "net", "ltd", "plc"]);

// "mail.thestage.co.uk" -> "thestage.co.uk"
export function baseDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const keep = SECOND_LEVEL.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2 ? 3 : 2;
  return parts.slice(-keep).join(".");
}

const WANTS = /confirm|verify|activate|opt-?in|subscribe|validate/i;
const FORBIDDEN = /unsub|opt-?out|remove|cancel|delete|preferences|manage|stop|report|spam/i;

export type ConfirmCheck = { ok: true } | { ok: false; reason: string };

export function checkConfirmLink(href: string, label: string, senderDomain: string | null, signupHost: string | null): ConfirmCheck {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return { ok: false, reason: "The link is not a web address." };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "The link is not secure (https)." };
  if (FORBIDDEN.test(u.pathname + u.search) || FORBIDDEN.test(label)) return { ok: false, reason: "The link looks like it could unsubscribe or change settings." };
  if (!WANTS.test(u.pathname + u.search) && !WANTS.test(label)) return { ok: false, reason: "The link does not look like a confirmation link." };
  const host = baseDomain(u.hostname);
  const trusted = [senderDomain && baseDomain(senderDomain), signupHost && baseDomain(signupHost), ...ESP_DOMAINS].filter(Boolean) as string[];
  if (!trusted.some((d) => host === d)) return { ok: false, reason: `The link goes to ${u.hostname}, which is not the sender's own site or a known mailing service.` };
  return { ok: true };
}

const SUCCESS = /confirmed|thank you|thanks for|subscribed|you.?re (now )?(subscribed|in|on the list)|welcome|success|verified|all set|activated|you.?ve been added/i;
const FAILURE = /expired|invalid|error|not found|already|could not|couldn.t|try again/i;

export type ConfirmResult = { status: "auto_done" | "needs_click"; note: string };

// Opens the confirmation link (GET only, no cookies) and reads whether it worked.
export async function autoConfirm(
  href: string,
  opts: { label: string; senderDomain: string | null; signupHost: string | null },
  testHooks?: { fetchImpl?: typeof fetch; allowPrivate?: boolean },
): Promise<ConfirmResult> {
  const check = checkConfirmLink(href, opts.label, opts.senderDomain, opts.signupHost);
  if (!check.ok) return { status: "needs_click", note: check.reason };
  const doFetch = testHooks?.fetchImpl ?? fetch;
  let current = new URL(href);
  try {
    for (let hop = 0; hop < 4; hop++) {
      if (!testHooks?.allowPrivate) await assertPublicUrl(current);
      const res = await doFetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AgentAngelBot/1.0)", Accept: "text/html" },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, current);
        // Stay on safe ground: a redirect must still be https and not an unsubscribe page.
        if (next.protocol !== "https:" && !testHooks?.allowPrivate) return { status: "needs_click", note: "The link redirected somewhere insecure." };
        if (FORBIDDEN.test(next.pathname + next.search)) return { status: "needs_click", note: "The link redirected to a page that looks like unsubscribing." };
        current = next;
        continue;
      }
      if (!res.ok) return { status: "needs_click", note: `The confirmation page answered with an error (${res.status}).` };
      const text = (await res.text()).slice(0, 200_000).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
      if (SUCCESS.test(text) && !FAILURE.test(text.slice(0, 1500))) return { status: "auto_done", note: `Angel opened the confirmation link on ${current.hostname} and the page said it worked.` };
      return { status: "needs_click", note: `Angel opened the link on ${current.hostname} but the page did not say it worked. It may need a button pressed.` };
    }
    return { status: "needs_click", note: "The link redirected too many times." };
  } catch (e) {
    return { status: "needs_click", note: `Angel could not open the link (${e instanceof Error ? e.message : "unknown error"}).` };
  }
}
