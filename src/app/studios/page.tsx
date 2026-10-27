import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowUpRight } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { CopyDraft } from "../show/show-client";
import { FindStudios, StudioStatus } from "./studios-client";

// The studio search runs as a server action on this page and takes a few minutes.
export const maxDuration = 300;

type Studio = {
  id: string;
  name: string;
  country: string | null;
  kind: "voice" | "capture" | "music" | "other";
  url: string;
  submission_url: string | null;
  what_they_buy: string | null;
  evidence: string | null;
  evidence_url: string | null;
  why: string | null;
  fit_score: number | null;
  pitch_draft: string | null;
  status: string;
};

const KINDS = [
  { key: "all", label: "All" },
  { key: "voice", label: "Voice and audio" },
  { key: "capture", label: "Capture and games" },
  { key: "music", label: "Music" },
] as const;
const KIND_LABEL: Record<string, string> = { voice: "Voice and audio", capture: "Capture and games", music: "Music", other: "Other" };

async function StudiosContent({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  await connection();
  await requireUser();
  const [{ k }, st] = await Promise.all([searchParams, getSettings()]);
  const kind = KINDS.some((x) => x.key === k) ? (k as string) : "all";
  let q = createAdminClient().from("studios").select("*").order("fit_score", { ascending: false, nullsFirst: false }).limit(200);
  if (kind !== "all") q = q.eq("kind", kind);
  const { data } = await q;
  const studios = (data ?? []) as Studio[];

  return (
    <>
      <AppHeader active="studios" />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8">
        <div className="space-y-3">
          <p className="eyebrow">Beyond theatre castings</p>
          <h1 className="text-4xl tracking-tight">Studio map</h1>
          <p className="max-w-2xl text-sm text-ink-soft">
            Companies that have a real reason to hire someone who {st.studios.skills}. Each has a draft email to adapt and send yourself. Nothing is sent for you.
          </p>
          <FindStudios />
        </div>

        <nav className="glass inline-flex flex-wrap rounded-full p-1" aria-label="Kind of studio">
          {KINDS.map((x) => (
            <Link
              key={x.key}
              href={x.key === "all" ? "/studios" : `/studios?k=${x.key}`}
              className={cn("rounded-full px-3.5 py-1.5 text-sm transition-all", kind === x.key ? "bg-oxblood text-paper" : "text-ink-soft hover:bg-white/60 hover:text-ink")}
            >
              {x.label}
            </Link>
          ))}
        </nav>

        {studios.length === 0 ? (
          <p className="glass rounded-[28px] p-8 text-center text-sm text-ink-soft">No studios yet. Press Find studios to build the map.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {studios.map((s) => (
              <article key={s.id} className={cn("glass flex flex-col gap-2 rounded-[28px] p-5", s.status === "not_now" && "opacity-60")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow">{KIND_LABEL[s.kind]}{s.country ? ` · ${s.country}` : ""}</p>
                    <h3 className="font-serif text-xl leading-snug">{s.name}</h3>
                    {s.what_they_buy && <p className="text-xs text-ink-soft">Looks for: {s.what_they_buy}</p>}
                  </div>
                  {s.fit_score !== null && (
                    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums", s.fit_score >= 8 ? "bg-oxblood text-paper" : s.fit_score >= 6 ? "bg-oxblood/15 text-oxblood" : "bg-white/60")}>
                      {s.fit_score}/10
                    </span>
                  )}
                </div>
                {s.why && <p className="text-sm">{s.why}</p>}
                {s.evidence && (
                  <p className="text-xs text-ink-soft">
                    Recent work: {s.evidence}
                    {s.evidence_url && (
                      <>
                        {" "}
                        <a href={s.evidence_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">source</a>
                      </>
                    )}
                  </p>
                )}
                {s.pitch_draft && (
                  <details className="rounded-2xl bg-white/40 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-oxblood">Draft email</summary>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{s.pitch_draft}</p>
                    <CopyDraft text={s.pitch_draft} />
                  </details>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  <StudioStatus id={s.id} value={s.status} />
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-ink-soft hover:text-ink">
                    Website <ArrowUpRight className="size-3.5" />
                  </a>
                  {s.submission_url && (
                    <a href={s.submission_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-oxblood hover:underline">
                      How to apply <ArrowUpRight className="size-3.5" />
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="text-xs text-ink-soft">Check each studio&apos;s site before contacting. Use business contact details only, and send one personal email at a time.</p>
      </main>
    </>
  );
}

export default function StudiosPage({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-ink-soft">Loading...</p>}>
      <StudiosContent searchParams={searchParams} />
    </Suspense>
  );
}
