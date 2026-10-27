import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowUpRight } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { BOARD_COLUMNS, daysUntil, deadlineLabel, STATUS_LABEL, type Status } from "@/lib/tracker";
import { cn } from "@/lib/utils";
import { saveDetails } from "./actions";
import { StatusSelect } from "./status-select";

type TrackedRow = {
  id: string;
  title: string;
  company: string | null;
  url: string | null;
  match_score: number;
  status: Status;
  deadline: string | null;
  deadline_text: string | null;
  notes: string | null;
  status_changed_at: string | null;
};

function TrackerCard({ a }: { a: TrackedRow }) {
  const soon = a.deadline !== null && daysUntil(a.deadline) <= 7 && daysUntil(a.deadline) >= 0;
  return (
    <div className="glass-chip space-y-3 rounded-3xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-serif text-base leading-snug">{a.title}</p>
          <p className="text-xs text-ink-soft">{a.company || "Company not stated"}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/60 px-2 py-0.5 text-xs font-semibold tabular-nums">{a.match_score}/10</span>
      </div>
      {(a.deadline || a.deadline_text) && (
        <p className={cn("text-xs", soon ? "font-semibold text-oxblood" : "text-ink-soft")}>
          {a.deadline ? deadlineLabel(a.deadline) : a.deadline_text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <StatusSelect id={a.id} value={a.status} />
        {a.url && (
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-ink-soft hover:bg-white/60 hover:text-ink">
            Open <ArrowUpRight className="size-3" />
          </a>
        )}
      </div>
      {a.notes && <p className="whitespace-pre-wrap rounded-2xl bg-white/40 px-3 py-2 text-xs text-ink-soft">{a.notes}</p>}
      <details>
        <summary className="cursor-pointer list-none text-xs text-ink-soft hover:text-ink">
          {a.notes ? "Notes and deadline" : "Add notes or a deadline"}
        </summary>
        <form action={saveDetails} className="mt-2 space-y-2">
          <input type="hidden" name="id" value={a.id} />
          <textarea
            name="notes"
            defaultValue={a.notes ?? ""}
            rows={3}
            placeholder="Song choices, who you spoke to, what to prepare..."
            className="glass-input w-full rounded-2xl px-3 py-2 text-sm outline-none placeholder:text-ink-soft"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-soft" htmlFor={`deadline-${a.id}`}>Deadline</label>
            <input id={`deadline-${a.id}`} type="date" name="deadline" defaultValue={a.deadline ?? ""} className="glass-input rounded-full px-3 py-1 text-xs outline-none" />
            <button type="submit" className="ml-auto rounded-full bg-ink px-3 py-1 text-xs text-paper hover:bg-oxblood">Save</button>
          </div>
        </form>
      </details>
    </div>
  );
}

async function TrackerContent() {
  await connection(); // deadlines are worked out from today's date
  await requireUser();
  const { data, error } = await createAdminClient()
    .from("auditions")
    .select("id, title, company, url, match_score, status, deadline, deadline_text, notes, status_changed_at")
    .in("status", BOARD_COLUMNS)
    .order("deadline", { ascending: true, nullsFirst: false });
  const rows = (data ?? []) as TrackedRow[];

  return (
    <>
      <AppHeader active="tracker" />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-8">
        <div>
          <p className="eyebrow">Tracker</p>
          <h1 className="text-4xl tracking-tight">Your applications</h1>
          <p className="text-sm text-ink-soft">Tap &quot;Want to apply&quot; on any match to add it here, then move it along as things happen.</p>
        </div>
        {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Could not load the tracker: {error.message}</p>}
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {BOARD_COLUMNS.map((col) => {
            const items = rows.filter((r) => r.status === col);
            return (
              <section key={col} className="glass flex flex-col gap-3 rounded-[28px] p-3">
                <div className="flex items-baseline justify-between px-1 pt-1">
                  <h2 className="font-serif text-lg">{STATUS_LABEL[col]}</h2>
                  <span className="text-xs text-ink-soft">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line/70 px-3 py-6 text-center text-xs text-ink-soft">Nothing here yet</p>
                ) : (
                  items.map((a) => <TrackerCard key={a.id} a={a} />)
                )}
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}

export default function TrackerPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-ink-soft">Loading...</p>}>
      <TrackerContent />
    </Suspense>
  );
}
