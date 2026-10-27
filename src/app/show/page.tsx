import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowUpRight, Check, ChevronLeft, Plus } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ensureProject, plansOf, topLevel, type Project } from "@/lib/projects";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { daysUntil, deadlineLabel, eventDateLabel, STATUS_LABEL, type Status } from "@/lib/tracker";
import { cn } from "@/lib/utils";
import { setStatusForm } from "../tracker/actions";
import { addTask, archiveProject, createProject, toggleTask, updateProject } from "./actions";
import { CopyDraft, PresenterStatus, ProducerButton } from "./show-client";

// The producer research runs as a server action on this page and takes a few minutes.
export const maxDuration = 300;

type Task = { id: string; project_id: string; title: string; due: string | null; details: string | null; url: string | null; done: boolean };
type Presenter = {
  id: string;
  project_id: string;
  name: string;
  organisation: string | null;
  url: string;
  evidence: string | null;
  why: string | null;
  invite_draft: string | null;
  status: string;
};
type Funding = {
  id: string;
  project_id: string;
  title: string;
  company: string | null;
  url: string | null;
  match_score: number;
  match_reason: string | null;
  status: Status;
  deadline: string | null;
  deadline_text: string | null;
};

const input = "glass-input w-full rounded-2xl px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-oxblood/30";

function ProjectFields({ p, plan }: { p?: Project; plan?: boolean }) {
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium">{plan ? "Plan name" : "Project name"}</span>
        <input name="name" required defaultValue={p?.name} placeholder={plan ? "Schools tour" : "My new show"} className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium">{plan ? "What this plan is" : "What the project is"}</span>
        <textarea name="summary" rows={3} defaultValue={p?.summary} className={input} />
      </label>
      {plan && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium">Next stop</span>
              <input name="goal" defaultValue={p?.goal} placeholder="Festival, tour or scheme" className={input} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Look for funding from</span>
              <input name="fundingCountries" defaultValue={p?.funding_countries} placeholder="Norway, the UK" className={input} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Guidance for the producer (optional)</span>
            <textarea name="focus" rows={3} defaultValue={p?.focus} placeholder="Include safeguarding checks as tasks. Focus on county schemes." className={input} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">Who could book it, in a few words</span>
            <input name="buyersLabel" defaultValue={p?.buyers_label ?? "Programmers to invite"} className={input} />
          </label>
        </>
      )}
    </div>
  );
}

function TaskList({ tasks, planName }: { tasks: Task[]; planName?: (id: string) => string | null }) {
  return (
    <ul className="glass divide-y divide-white/60 rounded-[28px] px-2">
      {tasks.map((t) => {
        const soon = t.due && !t.done && daysUntil(t.due) >= 0 && daysUntil(t.due) <= 7;
        const plan = planName?.(t.project_id);
        return (
          <li key={t.id} className={cn("flex items-start gap-3 px-3 py-3", t.done && "opacity-50")}>
            <form action={toggleTask}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="done" value={String(t.done)} />
              <button
                type="submit"
                aria-label={t.done ? "Mark as not done" : "Mark as done"}
                className={cn("mt-0.5 grid size-5 place-items-center rounded-full border", t.done ? "border-oxblood bg-oxblood text-paper" : "border-line bg-white/50 hover:border-oxblood")}
              >
                {t.done && <Check className="size-3" />}
              </button>
            </form>
            <div className="min-w-0 flex-1">
              {plan && <span className="glass-chip mb-1 inline-block rounded-full px-2.5 py-0.5 text-xs text-ink-soft">{plan}</span>}
              <p className={cn("font-medium", t.done && "line-through")}>{t.title}</p>
              {t.details && <p className="text-sm text-ink-soft">{t.details}</p>}
            </div>
            <div className="shrink-0 text-right text-xs">
              {t.due && <p className={cn("tabular-nums", soon ? "font-semibold text-oxblood" : "text-ink-soft")}>{eventDateLabel(t.due)}</p>}
              {t.url && (
                <a href={t.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-ink-soft hover:text-ink">
                  Official page <ArrowUpRight className="size-3" />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function FundingCards({ funding, planName }: { funding: Funding[]; planName?: (id: string) => string | null }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {funding.map((f) => {
        const plan = planName?.(f.project_id);
        return (
          <article key={f.id} className="glass flex flex-col gap-2 rounded-[28px] p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {plan && <span className="glass-chip mb-1 inline-block rounded-full px-2.5 py-0.5 text-xs text-ink-soft">{plan}</span>}
                <h3 className="font-serif text-lg leading-snug">{f.title}</h3>
                <p className="text-xs text-ink-soft">{f.company}</p>
              </div>
              <span className="shrink-0 rounded-full bg-white/60 px-2.5 py-1 text-xs font-semibold tabular-nums">{f.match_score}/10</span>
            </div>
            {(f.deadline || f.deadline_text) && (
              <p className={cn("text-xs", f.deadline && daysUntil(f.deadline) >= 0 && daysUntil(f.deadline) <= 14 ? "font-semibold text-oxblood" : "text-ink-soft")}>
                {f.deadline ? deadlineLabel(f.deadline) : `Deadline: ${f.deadline_text}`}
              </p>
            )}
            {f.match_reason && <p className="text-sm">{f.match_reason}</p>}
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
              {f.status === "to_look_at" ? (
                <form action={setStatusForm}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="status" value="want_to_apply" />
                  <button type="submit" className="rounded-full bg-oxblood px-3 py-1.5 text-xs text-paper hover:brightness-110">Want to apply</button>
                </form>
              ) : (
                <span className="glass-chip rounded-full px-3 py-1.5 text-xs text-ink-soft">{STATUS_LABEL[f.status]}</span>
              )}
              {f.url && (
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-ink-soft hover:text-ink">
                  Official page <ArrowUpRight className="size-3.5" />
                </a>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function AddTaskForm({ projectId, label }: { projectId: string; label: string }) {
  return (
    <form action={addTask} className="glass-input flex flex-wrap gap-2 rounded-full p-1.5 pl-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input name="title" required placeholder={label} aria-label="Task" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-soft" />
      <input name="due" type="date" aria-label="Date (optional)" className="bg-transparent text-xs text-ink-soft outline-none" />
      <button type="submit" className="rounded-full bg-ink px-4 py-1.5 text-xs text-paper hover:bg-oxblood">Add</button>
    </form>
  );
}

function ChipLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("rounded-full px-4 py-2 text-sm transition", active ? "bg-oxblood text-paper" : "glass-chip text-ink-soft hover:text-ink")}
    >
      {children}
    </Link>
  );
}

async function ShowContent({ searchParams }: { searchParams: Promise<{ p?: string; plan?: string }> }) {
  await connection(); // dates are worked out from today
  await requireUser();
  const [{ p: wantedP, plan: wantedPlan }, st] = await Promise.all([searchParams, getSettings()]);
  const db = createAdminClient();
  const all = await ensureProject(db);
  const tops = topLevel(all);

  // Old links may point straight at a plan: open it under its project.
  const asPlan = all.find((x) => x.id === wantedP && x.parent_id);
  const top = asPlan ? all.find((x) => x.id === asPlan.parent_id) : (tops.find((x) => x.id === wantedP) ?? tops[0]);
  const plans = top ? plansOf(all, top.id) : [];
  const plan = plans.find((x) => x.id === (asPlan?.id ?? wantedPlan));
  const planName = (id: string) => plans.find((x) => x.id === id)?.name ?? null;

  const scopeIds = plan ? [plan.id] : top ? [top.id, ...plans.map((x) => x.id)] : [];
  const [{ data: tasks }, { data: presenters }, { data: funding }] = scopeIds.length
    ? await Promise.all([
        db.from("show_tasks").select("*").in("project_id", scopeIds).order("done").order("due", { ascending: true, nullsFirst: false }),
        db.from("presenters").select("*").in("project_id", scopeIds).order("created_at"),
        db
          .from("auditions")
          .select("id, project_id, title, company, url, match_score, match_reason, status, deadline, deadline_text")
          .in("project_id", scopeIds)
          .neq("status", "not_for_me")
          .order("deadline", { ascending: true, nullsFirst: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const taskRows = (tasks ?? []) as Task[];
  const presenterRows = (presenters ?? []) as Presenter[];
  const fundingRows = (funding ?? []) as unknown as Funding[];

  return (
    <>
      <AppHeader active="show" />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-8">
        <div className="space-y-3">
          <p className="eyebrow">{st.client.firstName}&apos;s creative projects · produced with {st.agent.name}</p>
          <nav className="flex flex-wrap gap-2" aria-label="Projects">
            {tops.map((x) => (
              <ChipLink key={x.id} href={`/show?p=${x.id}`} active={x.id === top?.id}>
                {x.name}
              </ChipLink>
            ))}
            <a href="#new-project" className="glass-chip inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-ink-soft hover:text-ink">
              <Plus className="size-4" aria-hidden /> New project
            </a>
          </nav>
        </div>

        {top && (
          <>
            <div className="space-y-3">
              <h1 className="text-4xl leading-tight tracking-tight">{top.name}</h1>
              <nav className="flex flex-wrap gap-2" aria-label="Plans">
                <ChipLink href={`/show?p=${top.id}`} active={!plan}>Overview</ChipLink>
                {plans.map((x) => (
                  <ChipLink key={x.id} href={`/show?p=${top.id}&plan=${x.id}`} active={x.id === plan?.id}>
                    {x.name}
                  </ChipLink>
                ))}
                <a href="#new-plan" className="glass-chip inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-ink-soft hover:text-ink">
                  <Plus className="size-4" aria-hidden /> New plan
                </a>
              </nav>
            </div>

            {!plan ? (
              <>
                <p className="max-w-2xl text-sm text-ink-soft">{top.summary}</p>

                <section className="space-y-3">
                  <h2 className="font-serif text-2xl">Plans for this project</h2>
                  <p className="text-xs text-ink-soft">The creative project is the show itself. Each plan is a way of taking it out into the world, with its own dates, money and contacts.</p>
                  {plans.length === 0 ? (
                    <p className="glass rounded-[28px] p-6 text-sm text-ink-soft">No plans yet. Add one below: a festival run, a tour, a schools programme.</p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {plans.map((x) => {
                        const mine = taskRows.filter((t) => t.project_id === x.id);
                        const open = mine.filter((t) => !t.done);
                        const next = open.find((t) => t.due && daysUntil(t.due) >= 0);
                        return (
                          <Link key={x.id} href={`/show?p=${top.id}&plan=${x.id}`} className="glass group flex flex-col gap-2 rounded-[28px] p-5 transition hover:-translate-y-0.5">
                            <h3 className="font-serif text-xl leading-snug">{x.name}</h3>
                            {x.goal && <p className="text-xs text-ink-soft">Next stop: {x.goal}</p>}
                            {next && next.due && (
                              <p className={cn("text-sm", daysUntil(next.due) <= 7 ? "font-semibold text-oxblood" : "")}>
                                Next: {next.title} · <span className="tabular-nums">{eventDateLabel(next.due)}</span>
                              </p>
                            )}
                            <p className="mt-auto pt-1 text-xs text-ink-soft">
                              {open.length} open task{open.length === 1 ? "" : "s"} · {fundingRows.filter((f) => f.project_id === x.id).length} funding leads ·{" "}
                              {presenterRows.filter((r) => r.project_id === x.id).length} contacts
                            </p>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <h2 className="font-serif text-2xl">All dates and tasks</h2>
                  {taskRows.length === 0 ? (
                    <p className="glass rounded-[28px] p-6 text-sm text-ink-soft">Nothing yet. Open a plan and run the producer, or add your own below.</p>
                  ) : (
                    <TaskList tasks={taskRows} planName={(id) => (id === top.id ? "Project" : planName(id))} />
                  )}
                  <AddTaskForm projectId={top.id} label="Add a task for the project as a whole" />
                </section>

                {fundingRows.length > 0 && (
                  <section className="space-y-3">
                    <h2 className="font-serif text-2xl">Funding, soonest first</h2>
                    <FundingCards funding={fundingRows.slice(0, 6)} planName={(id) => (id === top.id ? null : planName(id))} />
                    {fundingRows.length > 6 && <p className="text-xs text-ink-soft">{fundingRows.length - 6} more across the plans. Open a plan to see them all.</p>}
                  </section>
                )}

                <details className="glass rounded-[28px] p-5">
                  <summary className="cursor-pointer text-sm font-medium text-oxblood">Edit this project</summary>
                  <form action={updateProject} className="mt-4 space-y-4">
                    <input type="hidden" name="id" value={top.id} />
                    <ProjectFields p={top} />
                    <button type="submit" className="rounded-full bg-oxblood px-4 py-2 text-sm text-paper hover:brightness-110">Save project</button>
                  </form>
                  <form action={archiveProject} className="mt-4 border-t border-white/60 pt-4">
                    <input type="hidden" name="id" value={top.id} />
                    <p className="mb-2 text-xs text-ink-soft">Archiving hides this project and its plans from the app. Their dates, funding and contacts are kept.</p>
                    <button type="submit" className="glass-chip rounded-full px-4 py-2 text-xs text-ink-soft hover:text-destructive">Archive this project</button>
                  </form>
                </details>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <Link href={`/show?p=${top.id}`} className="inline-flex items-center gap-1 text-xs text-ink-soft hover:text-ink">
                    <ChevronLeft className="size-3.5" aria-hidden /> {top.name}
                  </Link>
                  <h2 className="text-3xl leading-tight tracking-tight">{plan.name}</h2>
                  <p className="max-w-2xl text-sm text-ink-soft">{plan.summary}</p>
                  <ProducerButton projectId={plan.id} />
                  <p className="text-xs text-ink-soft">Nothing is registered, submitted or sent for you. The producer finds dates, money and contacts, and drafts invites to send yourself.</p>
                </div>

                <section className="space-y-3">
                  <h2 className="font-serif text-2xl">Key dates{plan.goal ? ` · ${plan.goal}` : ""}</h2>
                  {taskRows.length === 0 ? (
                    <p className="glass rounded-[28px] p-6 text-sm text-ink-soft">No dates yet. Run the producer to fill these in, or add your own below.</p>
                  ) : (
                    <TaskList tasks={taskRows} />
                  )}
                  <AddTaskForm projectId={plan.id} label="Add your own task or date" />
                </section>

                <section className="space-y-3">
                  <h2 className="font-serif text-2xl">Funding</h2>
                  {fundingRows.length === 0 ? <p className="glass rounded-[28px] p-6 text-sm text-ink-soft">No funding leads yet.</p> : <FundingCards funding={fundingRows} />}
                </section>

                <section className="space-y-3">
                  <div>
                    <h2 className="font-serif text-2xl">{plan.buyers_label}</h2>
                    <p className="text-xs text-ink-soft">People and organisations who have booked or commissioned work like this. Each has a draft invite to adapt and send yourself.</p>
                  </div>
                  {presenterRows.length === 0 ? (
                    <p className="glass rounded-[28px] p-6 text-sm text-ink-soft">None yet.</p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {presenterRows.map((p) => (
                        <article key={p.id} className={cn("glass flex flex-col gap-2 rounded-[28px] p-5", p.status === "not_now" && "opacity-60")}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="font-serif text-lg leading-snug">{p.name}</h3>
                              {p.organisation && <p className="text-xs text-ink-soft">{p.organisation}</p>}
                            </div>
                            <PresenterStatus id={p.id} value={p.status} />
                          </div>
                          {p.why && <p className="text-sm">{p.why}</p>}
                          {p.evidence && <p className="text-xs text-ink-soft">Evidence: {p.evidence}</p>}
                          {p.invite_draft && (
                            <details className="rounded-2xl bg-white/40 px-3 py-2">
                              <summary className="cursor-pointer text-xs font-medium text-oxblood">Draft invite</summary>
                              <p className="mt-2 whitespace-pre-wrap text-sm">{p.invite_draft}</p>
                              <CopyDraft text={p.invite_draft} />
                            </details>
                          )}
                          <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex items-center gap-1 self-end text-xs text-ink-soft hover:text-ink">
                            Their page <ArrowUpRight className="size-3.5" />
                          </a>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <details className="glass rounded-[28px] p-5">
                  <summary className="cursor-pointer text-sm font-medium text-oxblood">Edit this plan</summary>
                  <form action={updateProject} className="mt-4 space-y-4">
                    <input type="hidden" name="id" value={plan.id} />
                    <ProjectFields p={plan} plan />
                    <button type="submit" className="rounded-full bg-oxblood px-4 py-2 text-sm text-paper hover:brightness-110">Save plan</button>
                  </form>
                  <form action={archiveProject} className="mt-4 border-t border-white/60 pt-4">
                    <input type="hidden" name="id" value={plan.id} />
                    <p className="mb-2 text-xs text-ink-soft">Archiving hides this plan from the app. Its dates, funding and contacts are kept.</p>
                    <button type="submit" className="glass-chip rounded-full px-4 py-2 text-xs text-ink-soft hover:text-destructive">Archive this plan</button>
                  </form>
                </details>
              </>
            )}

            <section id="new-plan" className="glass scroll-mt-28 rounded-[28px] p-5 md:p-6">
              <h2 className="font-serif text-2xl">New plan for {top.name}</h2>
              <p className="mb-4 text-sm text-ink-soft">A festival run, a tour, a schools programme, a commission. The producer researches each plan separately, knowing it belongs to this project.</p>
              <form action={createProject} className="space-y-4">
                <input type="hidden" name="parentId" value={top.id} />
                <ProjectFields plan />
                <button type="submit" className="rounded-full bg-oxblood px-4 py-2 text-sm text-paper hover:brightness-110">Create plan</button>
              </form>
            </section>
          </>
        )}

        <section id="new-project" className="glass scroll-mt-28 rounded-[28px] p-5 md:p-6">
          <h2 className="font-serif text-2xl">New creative project</h2>
          <p className="mb-4 text-sm text-ink-soft">Another show, a record, a book: something you are making. You add plans to it afterwards.</p>
          <form action={createProject} className="space-y-4">
            <ProjectFields />
            <button type="submit" className="rounded-full bg-oxblood px-4 py-2 text-sm text-paper hover:brightness-110">Create project</button>
          </form>
        </section>
      </main>
    </>
  );
}

export default function ShowPage({ searchParams }: { searchParams: Promise<{ p?: string; plan?: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-ink-soft">Loading...</p>}>
      <ShowContent searchParams={searchParams} />
    </Suspense>
  );
}
