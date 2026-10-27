import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { jobStatuses } from "@/lib/routine";
import { getSettings } from "@/lib/settings";
import { daysUntil, deadlineLabel, STATUS_LABEL, type Status } from "@/lib/tracker";
import { setStatusForm } from "./tracker/actions";
import { cn } from "@/lib/utils";


const FILTERS = [
  { key: "all", label: "Show all" },
  { key: "actor-musician", label: "Actor-Musician only" },
  { key: "grants", label: "Grants only" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

type AuditionRow = {
  id: string;
  title: string;
  company: string | null;
  url: string | null;
  match_score: number;
  match_reason: string | null;
  category: "audition" | "grant" | "other";
  is_actor_musician: boolean;
  date_posted: string | null;
  created_at: string;
  status: Status;
  deadline: string | null;
  deadline_text: string | null;
  sources: { label: string | null; handle: string | null; type: string; value: string } | null;
};

function scoreStyle(score: number) {
  if (score >= 9) return "bg-oxblood text-paper";
  if (score >= 8) return "bg-oxblood/15 text-oxblood";
  return "bg-white/60 text-ink";
}

function sourceName(s: AuditionRow["sources"], agentName: string) {
  if (!s) return "Removed source";
  if (s.handle) return `@${s.handle}`;
  if (s.type === "AGENT_SEARCH") return `Found by ${agentName}`;
  return s.label || s.value;
}

async function DashboardContent({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await connection(); // deadlines are worked out from today's date
  await requireUser();
  const [{ filter: rawFilter }, st] = await Promise.all([searchParams, getSettings()]);
  const filter: FilterKey = FILTERS.some((f) => f.key === rawFilter) ? (rawFilter as FilterKey) : "all";

  let query = createAdminClient()
    .from("auditions")
    .select("id, title, company, url, match_score, match_reason, category, is_actor_musician, date_posted, created_at, status, deadline, deadline_text, sources(label, handle, type, value)")
    .gte("match_score", 7)
    .neq("status", "not_for_me")
    .order("date_posted", { ascending: false, nullsFirst: false })
    .limit(200);
  if (filter === "actor-musician") query = query.eq("is_actor_musician", true);
  if (filter === "grants") query = query.eq("category", "grant");

  const { data, error } = await query;
  const dueCount = (await jobStatuses(createAdminClient(), st)).filter((j) => j.due).length;
  const rows = (data ?? []) as unknown as AuditionRow[];

  return (
    <>
      <AppHeader active="dashboard" />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1 className="text-4xl tracking-tight">Your matches</h1>
            <p className="text-sm text-muted-foreground">Castings and funding scored 7 or higher for {st.client.firstName}.</p>
          </div>
          <nav className="glass inline-flex rounded-full p-1" aria-label="Filter">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={f.key === "all" ? "/" : `/?filter=${f.key}`}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm transition-all duration-300",
                  filter === f.key ? "bg-oxblood text-paper" : "text-ink-soft hover:bg-white/60 hover:text-ink",
                )}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        </div>

        {!st.onboarding.done && (
          <Link href="/onboarding" className="glass flex items-center justify-between gap-3 rounded-full px-5 py-3 text-sm hover:bg-white/70">
            <span>
              <span className="font-medium">Set up with {st.agent.name} in three minutes.</span> <span className="text-ink-soft">She finds out who you are and where you want to work.</span>
            </span>
            <span className="shrink-0 text-oxblood">Start</span>
          </Link>
        )}
        {dueCount > 0 && (
          <Link href="/digest" className="glass flex items-center justify-between gap-3 rounded-full px-5 py-3 text-sm hover:bg-white/70">
            <span>
              <span className="font-medium">{dueCount} routine job{dueCount === 1 ? " is" : "s are"} waiting for your OK.</span> <span className="text-ink-soft">Nothing runs until you say so.</span>
            </span>
            <span className="shrink-0 text-oxblood">Open Picks</span>
          </Link>
        )}
        {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Could not load matches: {error.message}</p>}

        {!error && rows.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No matches yet. Add Instagram feeds and mailing lists on the{" "}
              <Link href="/settings" className="underline underline-offset-4">Sources</Link> page, then check back.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((a) => (
            <Card key={a.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="leading-snug">{a.title}</CardTitle>
                    <CardDescription>{a.company || "Company not stated"}</CardDescription>
                  </div>
                  <span
                    className={cn("shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums", scoreStyle(a.match_score))}
                    title="Match score out of 10"
                  >
                    {a.match_score}/10
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <p className="text-sm">{a.match_reason}</p>
                {(a.deadline || a.deadline_text) && (
                  <p className={cn("text-xs", a.deadline && daysUntil(a.deadline) >= 0 && daysUntil(a.deadline) <= 7 ? "font-semibold text-oxblood" : "text-ink-soft")}>
                    {a.deadline ? deadlineLabel(a.deadline) : `Deadline: ${a.deadline_text}`}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {a.is_actor_musician && <Badge>Actor-Musician</Badge>}
                  {a.category === "grant" && <Badge variant="secondary">Grant</Badge>}
                  {a.category === "audition" && <Badge variant="outline">Audition</Badge>}
                  {a.status !== "to_look_at" && <Badge variant="secondary">{STATUS_LABEL[a.status]}</Badge>}
                </div>
                {a.status === "to_look_at" && (
                  <div className="flex gap-2">
                    <form action={setStatusForm}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="status" value="want_to_apply" />
                      <button type="submit" className="rounded-full bg-oxblood px-3 py-1.5 text-xs text-paper transition hover:brightness-110">Want to apply</button>
                    </form>
                    <form action={setStatusForm}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="status" value="not_for_me" />
                      <button type="submit" className="glass-chip rounded-full px-3 py-1.5 text-xs text-ink-soft hover:text-ink">Not for me</button>
                    </form>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {new Date(a.date_posted ?? a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  {" · "}
                  {sourceName(a.sources, st.agent.name)}
                </span>
                {a.url && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    View original <ExternalLink className="size-3.5" />
                  </a>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}

export default function Dashboard({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-muted-foreground">Loading...</p>}>
      <DashboardContent searchParams={searchParams} />
    </Suspense>
  );
}
