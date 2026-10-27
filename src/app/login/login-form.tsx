"use client";

import { useActionState, useState } from "react";
import { MailOpen } from "lucide-react";
import { sendMagicLink, type LoginState } from "./actions";

const input = "glass-input w-full rounded-2xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-oxblood/30";
const primary = "w-full rounded-full bg-oxblood px-4 py-3 text-sm font-medium text-paper transition hover:brightness-110 disabled:opacity-50";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {});
  const [editing, setEditing] = useState(false);

  // After sending: make the next step (go to your email) impossible to miss.
  if (state.sentTo && !editing) {
    return (
      <div className="space-y-5 text-center" role="status" aria-live="polite">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-oxblood text-paper shadow-[0_10px_30px_-12px_rgb(136_28_36/0.8)]">
          <MailOpen className="size-8" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="font-serif text-2xl">Now check your email</h2>
          <p className="text-sm text-ink-soft">
            We&apos;ve sent a login link to
            <br />
            <span className="font-medium text-ink">{state.sentTo}</span>
          </p>
        </div>
        <ol className="space-y-2 text-left text-sm">
          {["Open your email inbox.", 'Find the email called "Your sign-in link".', "Tap Sign in. Use this same phone or computer."].map((step, i) => (
            <li key={step} className="glass-chip flex items-center gap-3 rounded-2xl px-3 py-2.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-oxblood/15 text-xs font-semibold text-oxblood">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <p className="text-xs text-ink-soft">
          Not there after a minute? Check your junk or spam folder. The email comes from your own sign-in sender and the link works once.
        </p>
        <form action={action} className="space-y-2">
          <input type="hidden" name="email" value={state.sentTo} />
          <button type="submit" disabled={pending} className="glass-chip w-full rounded-full px-4 py-2.5 text-sm hover:bg-white/70 disabled:opacity-50">
            {pending ? "Sending..." : "Send the link again"}
          </button>
        </form>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-ink-soft underline-offset-4 hover:underline">
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form action={(fd) => { setEditing(false); return action(fd); }} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Your email</span>
        <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={input} />
      </label>
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Sending your link..." : "Email me a login link"}
      </button>
      <p className="text-center text-xs text-ink-soft">No password needed. We&apos;ll email you a link, and you tap it to log in.</p>
      {state.error && <p className="text-center text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
