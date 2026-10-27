import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowUpRight } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { getComingUp, getPicks, type DigestSections } from "@/lib/digest";
import { upcomingProjectDates } from "@/lib/projects";
import { allWatched, recastsToWatch } from "@/lib/recast";
import { jobStatuses } from "@/lib/routine";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { daysUntil, deadlineLabel, eventDateLabel, STATUS_LABEL } from "@/lib/tracker";
import { cn } from "@/lib/utils";
import { setStatusForm } from "../tracker/actions";
import { DuePanel } from "./due-panel";
import { RecastButton, ScanButton } from "./scan-button";

// The radar scan runs as a server action on this page and takes a couple of minutes.
export const maxDuration = 300;

type Pick = DigestSections["fresh"][number];

function PickCard({ p, mode }: { p: Pick; mode: "decide" | "follow" }) {
  const soon = p.deadline !== null && daysUntil(p.deadline) >= 0 && daysUntil(p.deadline) <= 7;
  return (
    <article className="glass flex flex-col gap-3 rounded-[28px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-xl leading-snug">{p.title}</h3>
          <p className="text-sm text-ink-soft">{p.company || "Company not stated"}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums",
            p.match_score >= 9 ? "bg-oxblood text-paper" : p.match_score >= 8 ? "bg-oxblood/15 text-oxblood" : "bg-white/60 text-ink",
          )}
        >
          {p.match_score}/10
        </span>
      </div>
      {(p.deadline || p.deadline_text) && (
        <p className={cn("text-xs", soon ? "font-semibold text-oxblood" : "text-ink-soft")}>
          {p.deadline ? deadlineLabel(p.deadline) : `Deadline: ${p.deadline_text}`}
        </p>
      )}
      {p.match_reason && <p className="text-sm leading-relaxed">{p.match_reason}</p>}
      {mode === "follow" && (
        <p className="text-xs text-ink-soft">
          {STATUS_LABEL[p.status]}
          {p.status_changed_at && ` since ${new Date(p.status_changed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}. Worth a friendly
          follow-up email?
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {mode === "decide" && p.status === "to_look_at" ? (
          <>
            <form action={setStatusForm}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="status" value="want_to_apply" />
              <button type="submit" className="rounded-full bg-oxblood px-3.5 py-1.5 text-xs text-paper transition hover:brightness-110">Want to apply</button>
            </form>
            <form action={setStatusForm}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="status" value="not_for_me" />
              <button type="submit" className="glass-chip rounded-full px-3.5 py-1.5 text-xs text-ink-soft hover:text-ink">Not for me</button>
            </form>
          </>
        ) : (
          <Link href="/tracker" className="glass-chip rounded-full px-3.5 py-1.5 text-xs text-ink-soft hover:text-ink">
            {STATUS_LABEL[p.status]} · open tracker
          </Link>
        )}
        {p.url && (
          <a href={p.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-ink-soft hover:bg-white/60 hover:text-ink">
            View listing <ArrowUpRight className="size-3.5" />
          </a>
        )}
      </div>
    </article>
  );
}

function Section({ title, hint, items, mode }: { title: string; hint: string; items: Pick[]; mode: "decide" | "follow" }) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-2xl">{title}</h2>
        <span className="text-xs text-ink-soft">{hint}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((p) => (
          <PickCard key={p.id} p={p} mode={mode} />
        ))}
      </div>
    </section>
  );
}

async function PicksContent() {
  await connection(); // built from today's date
  await requireUser();
  const st = await getSettings();
  const db = createAdminClient();
  const [s, comingUp, projectDates, recasts, watched, jobs] = await Promise.all([getPicks(db), getComingUp(db), upcomingProjectDates(db, 21), recastsToWatch(db, 90), allWatched(db), jobStatuses(db, st)]);
  const dueJobs = jobs.filter((j) => j.due);
  const radarIds = new Set(comingUp.map((c) => c.id));
  s.fresh = s.fresh.filter((f) => !radarIds.has(f.id));
  const empty = !s.closing.length && !s.fresh.length && !s.followUp.length && !comingUp.length && !projectDates.length && !recasts.length && !watched.length;

  return (
    <>
      <AppHeader active="picks" />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-8">
        <div>
          <p className="eyebrow">Curated by {st.agent.name}</p>
          <h1 className="text-4xl tracking-tight">{st.client.firstName}&apos;s picks</h1>
          <p className="text-sm text-ink-soft">The best of everything found this week, most urgent first. Decide on each one and it moves to the tracker.</p>
        </div>
        <DuePanel jobs={dueJobs} />
        {empty && (
          <div className="glass rounded-[28px] p-10 text-center text-sm text-ink-soft">
            All caught up. Nothing waiting for a decision this week. {st.agent.catchphrase}
          </div>
        )}
        {projectDates.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-serif text-2xl">Project dates</h2>
              <Link href="/show" className="text-xs text-ink-soft underline-offset-4 hover:underline">All projects</Link>
            </div>
            <ul className="glass divide-y divide-white/60 rounded-[28px] px-2">
              {projectDates.map((d) => (
                <li key={d.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-3 text-sm">
                  <span className="glass-chip rounded-full px-2.5 py-0.5 text-xs text-ink-soft">{d.project}</span>
                  <span className="min-w-0 flex-1 font-medium">{d.title}</span>
                  <span className={cn("shrink-0 text-xs tabular-nums", daysUntil(d.due) <= 7 ? "font-semibold text-oxblood" : "text-ink-soft")}>{eventDateLabel(d.due)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <Section title="Closing soon" hint="Deadlines in the next 7 days" items={s.closing} mode="decide" />
        <Section title="New this week" hint="Scored 7 or more, not looked at yet" items={s.fresh} mode="decide" />
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl">Coming up, not cast yet</h2>
              <p className="text-xs text-ink-soft">
                Actor-musician shows spotted when they were announced, with a forecast of when casting opens. Checked every Monday.
              </p>
            </div>
            <ScanButton />
          </div>
          {comingUp.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {comingUp.map((p) => (
                <PickCard key={p.id} p={p} mode="decide" />
              ))}
            </div>
          ) : (
            <p className="glass rounded-[28px] p-6 text-sm text-ink-soft">Nothing on the radar yet. Scan now, or wait for Monday&apos;s check.</p>
          )}
        </section>
        {(recasts.length > 0 || watched.length > 0) && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl">Recasts to watch</h2>
                <p className="text-xs text-ink-soft">
                  Forecasts, not confirmed castings. Worked out from past cast-change announcements, with the sources. Refreshed monthly.
                </p>
              </div>
              <RecastButton />
            </div>
            {recasts.length === 0 ? (
              <p className="glass rounded-[28px] p-6 text-sm text-ink-soft">No recast windows in the next 3 months.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {recasts.map((w) => (
                  <article key={w.id} className="glass flex flex-col gap-2 rounded-[28px] p-5">
                    <div className="min-w-0">
                      <h3 className="font-serif text-xl leading-snug">{w.show}</h3>
                      <p className="text-xs text-ink-soft">{w.venue}</p>
                    </div>
                    <p className="text-sm font-semibold text-oxblood">
                      Forecast: {new Date(`${w.predicted_from}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} to{" "}
                      {new Date(`${w.predicted_to}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      <span className="ml-2 text-xs font-normal text-ink-soft">{w.confidence} confidence</span>
                    </p>
                    {w.basis && <p className="text-xs text-ink-soft">Based on: {w.basis}.</p>}
                    {w.fit_note && <p className="text-sm">{w.fit_note}</p>}
                    <p className="text-xs text-ink-soft">
                      Sources:{" "}
                      {w.history.slice(-3).map((h, i) => (
                        <span key={h.date}>
                          {i > 0 && ", "}
                          <a href={h.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                            {new Date(`${h.date}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                          </a>
                        </span>
                      ))}
                      {w.history.length === 0 && w.url && (
                        <a href={w.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">source</a>
                      )}
                    </p>
                  </article>
                ))}
              </div>
            )}
            {watched.length > 0 && (
              <details className="glass rounded-[28px] p-5">
                <summary className="cursor-pointer text-sm font-medium text-oxblood">Everything being watched ({watched.length})</summary>
                <ul className="mt-3 divide-y divide-white/60 text-sm">
                  {watched.map((w) => (
                    <li key={w.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                      <span className="min-w-0">{w.show} <span className="text-xs text-ink-soft">· {w.venue}</span></span>
                      <span className="text-xs tabular-nums text-ink-soft">
                        {w.predicted_from ? `${new Date(`${w.predicted_from}T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })} (${w.confidence})` : "no forecast yet"}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}
        <Section title="Time to follow up" hint="Applied over 2 weeks ago" items={s.followUp} mode="follow" />
        <p className="text-center text-xs text-ink-soft">
          Daily email round up: {st.digest.enabled && st.digest.recipients.length ? `on, to ${st.digest.recipients.join(", ")}` : "off"}.{" "}
          <Link href="/settings" className="underline underline-offset-4">Change in Settings</Link>
        </p>
      </main>
    </>
  );
}

export default function PicksPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-ink-soft">Loading...</p>}>
      <PicksContent />
    </Suspense>
  );
}
