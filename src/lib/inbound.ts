import "server-only";

// Angel's address: the one you copy into sign-up forms. ANGEL_EMAIL is the address itself
// (e.g. angel@in.yourdomain.com); a connected mailbox (IMAP_USER) is used if that is not set.
export function angelAddress(): string | null {
  const a = process.env.ANGEL_EMAIL || process.env.IMAP_USER || process.env.MAILTM_USER || "";
  return a.includes("@") ? a.toLowerCase() : null;
}

export const slugOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "list";
