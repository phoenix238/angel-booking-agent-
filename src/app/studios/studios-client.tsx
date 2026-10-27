"use client";

import { useActionState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { runStudiosAction, setStudioStatus } from "./actions";

export function FindStudios() {
  const [state, action, pending] = useActionState(runStudiosAction, {});
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          name="focus"
          placeholder="Optional focus, e.g. Norwegian audiobooks, or game studios in London"
          aria-label="What to focus on"
          className="glass-input min-w-0 flex-1 rounded-full px-4 py-2 text-sm outline-none"
        />
        <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 rounded-full bg-oxblood px-4 py-2 text-sm text-paper transition hover:brightness-110 disabled:opacity-50">
          <Sparkles className="size-4" aria-hidden />
          {pending ? "Searching... about 3 minutes" : "Find studios"}
        </button>
      </div>
      {state.ok && <p className="text-sm text-emerald-800">{state.ok}</p>}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

const LABELS: Record<string, string> = { to_contact: "To contact", contacted: "Contacted", replied: "Replied", booked: "Booked", not_now: "Not now" };

export function StudioStatus({ id, value }: { id: string; value: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Status"
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(() => setStudioStatus(id, next));
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
