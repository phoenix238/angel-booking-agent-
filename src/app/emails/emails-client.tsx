"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, MailPlus, Sparkles } from "lucide-react";
import { runRoutineJob } from "../digest/actions";
import { findListsAction, joinList, setMyDigest } from "./actions";

export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="glass-input select-all rounded-full px-4 py-2 text-sm">{address}</code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            .writeText(address)
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
        className="glass-chip inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs hover:bg-white/70"
      >
        {copied ? <Check className="size-3.5 text-oxblood" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// "Join": copies Angel's address, opens the list's sign-up page, and registers the list. The
// page must be opened inside the click itself or the browser blocks it as a pop-up.
export function JoinButton({
  suggestionId,
  name,
  url,
  organisation,
  address,
  compact,
}: {
  suggestionId?: string;
  name: string;
  url: string;
  organisation?: string;
  address: string | null;
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [error, setError] = useState("");
  if (!address) {
    return <span className="text-xs text-ink-soft">Angel&apos;s email address is not set up yet.</span>;
  }
  if (state === "done") {
    return (
      <div className="space-y-1 text-xs">
        <p className="font-medium text-emerald-800">Address copied. Paste it into their sign-up form.</p>
        <p className="text-ink-soft">
          Angel confirms the subscription herself when their email arrives. If the form will not accept it, type <code>{address}</code>.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          navigator.clipboard.writeText(address).catch(() => undefined);
          window.open(url, "_blank", "noopener,noreferrer");
          start(async () => {
            const r = await joinList({ suggestionId, name, url, organisation });
            if (r.error) {
              setError(r.error);
              setState("error");
            } else {
              setState("done");
            }
          });
        }}
        className={`inline-flex items-center gap-1.5 rounded-full bg-oxblood text-paper transition hover:brightness-110 disabled:opacity-50 ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
      >
        <MailPlus className="size-4" aria-hidden />
        {pending ? "Joining..." : "Join this list"}
      </button>
      {state === "error" && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function FindListsButton() {
  const [state, action, pending] = useActionState(findListsAction, {});
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input name="focus" placeholder="Optional focus, e.g. Norwegian theatres, or funding for solo shows" aria-label="What to focus on" className="glass-input min-w-0 flex-1 rounded-full px-4 py-2 text-sm outline-none" />
        <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 rounded-full bg-oxblood px-4 py-2 text-sm text-paper transition hover:brightness-110 disabled:opacity-50">
          <Sparkles className="size-4" aria-hidden />
          {pending ? "Searching... about 3 minutes" : "Find lists to join"}
        </button>
      </div>
      <p className="text-xs text-ink-soft">Costs about 60 to 80 cents. Every sign-up page is checked before it is shown.</p>
      {state.ok && <p className="text-sm text-emerald-800">{state.ok}</p>}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

export function CheckInboxButton() {
  const [state, action, pending] = useActionState(runRoutineJob, {});
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="job" value="mail" />
      <button type="submit" disabled={pending} className="glass-chip rounded-full px-4 py-2 text-sm hover:bg-white/70 disabled:opacity-50">
        {pending ? "Reading the inbox..." : "Check the inbox now"}
      </button>
      {state.ok && <p className="text-xs text-emerald-800">{state.ok}</p>}
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

export function DigestToggle({ on, email, canSend, recipients }: { on: boolean; email: string; canSend: boolean; recipients: string[] }) {
  return (
    <form action={setMyDigest} className="flex flex-wrap items-center gap-4">
      <input type="hidden" name="on" value={String(!on)} />
      <button
        type="submit"
        role="switch"
        aria-checked={on}
        aria-label="Send this digest to my own email"
        disabled={!canSend && !on}
        className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${on ? "bg-oxblood" : "bg-ink/25"}`}
      >
        <span className={`absolute top-0.5 size-6 rounded-full bg-paper shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
      <div className="min-w-0 text-sm">
        <p className="font-medium">{on ? `On. The digest is emailed to ${email} at 8am.` : "Off. Read the digest here instead."}</p>
        <p className="text-xs text-ink-soft">
          {canSend ? "Quiet days send nothing. Switch it on or off any time." : "Email sending is not connected yet, so this cannot be switched on."}
          {recipients.length > 0 && ` Going to: ${recipients.join(", ")}.`}
        </p>
      </div>
    </form>
  );
}
