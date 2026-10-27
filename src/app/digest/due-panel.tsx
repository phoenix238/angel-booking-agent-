"use client";

import { useActionState } from "react";
import { Hourglass } from "lucide-react";
import type { JobStatus } from "@/lib/routine";
import { runRoutineJob, snoozeRoutineJob } from "./actions";

function lastText(j: JobStatus) {
  if (j.lastRanAt === null) return "Never run";
  if (j.daysAgo === 0) return "Last ran today";
  return `Last ran ${j.daysAgo} day${j.daysAgo === 1 ? "" : "s"} ago`;
}

function DueRow({ j }: { j: JobStatus }) {
  const [state, action, pending] = useActionState(runRoutineJob, {});
  return (
    <li className="space-y-2 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{j.label}</p>
          <p className="text-sm text-ink-soft">{j.blurb}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {lastText(j)} · costs {j.cost}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={action}>
            <input type="hidden" name="job" value={j.key} />
            <button type="submit" disabled={pending} className="rounded-full bg-oxblood px-4 py-1.5 text-xs text-paper transition hover:brightness-110 disabled:opacity-50">
              {pending ? "Running... this can take a few minutes" : "Run it now"}
            </button>
          </form>
          <form action={snoozeRoutineJob}>
            <input type="hidden" name="job" value={j.key} />
            <button type="submit" disabled={pending} className="glass-chip rounded-full px-3 py-1.5 text-xs text-ink-soft hover:text-ink disabled:opacity-50">
              Ask again in a week
            </button>
          </form>
        </div>
      </div>
      {state.ok && <p className="text-sm text-emerald-800">{state.ok}</p>}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </li>
  );
}

export function DuePanel({ jobs }: { jobs: JobStatus[] }) {
  if (jobs.length === 0) return null;
  return (
    <section className="glass overflow-hidden rounded-[28px] border-oxblood/30" aria-labelledby="due-h">
      <div className="flex items-center gap-2 border-b border-white/60 px-4 py-3">
        <Hourglass className="size-4 text-oxblood" aria-hidden />
        <h2 id="due-h" className="font-serif text-xl">Waiting for your OK</h2>
      </div>
      <ul className="divide-y divide-white/60">
        {jobs.map((j) => (
          <DueRow key={j.key} j={j} />
        ))}
      </ul>
    </section>
  );
}
