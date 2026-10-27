"use client";

import { useActionState, useState, useTransition } from "react";
import { Copy, Sparkles } from "lucide-react";
import { runProducerAction, setPresenterStatus } from "./actions";

export function ProducerButton({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(runProducerAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex flex-wrap gap-2">
        <input
          name="focus"
          placeholder="Optional focus, e.g. Norwegian travel grants, or Edinburgh 2027"
          aria-label="What to focus on"
          className="glass-input min-w-0 flex-1 rounded-full px-4 py-2 text-sm outline-none"
        />
        <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 rounded-full bg-oxblood px-4 py-2 text-sm text-paper transition hover:brightness-110 disabled:opacity-50">
          <Sparkles className="size-4" aria-hidden />
          {pending ? "Researching... about 3 minutes" : "Run the producer"}
        </button>
      </div>
      {state.ok && <p className="text-sm text-emerald-800">{state.ok}</p>}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

const LABELS: Record<string, string> = {
  to_contact: "To contact",
  contacted: "Contacted",
  replied: "Replied",
  booked: "Booked",
  not_now: "Not now",
};

export function PresenterStatus({ id, value }: { id: string; value: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Status"
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(() => setPresenterStatus(id, next));
      }}
      className="glass-input rounded-full px-3 py-1.5 text-xs outline-none disabled:opacity-50"
    >
      {Object.entries(LABELS).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function CopyDraft({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-ink-soft hover:bg-white/60 hover:text-ink"
    >
      <Copy className="size-3.5" aria-hidden /> {copied ? "Copied" : "Copy draft"}
    </button>
  );
}
