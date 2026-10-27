"use client";

import { useActionState, useState } from "react";
import type { Settings } from "@/lib/settings";
import type { UsageSummary } from "@/lib/usage";
import { saveAgent, saveClient, saveCosts, saveDigest, saveRegions, saveRoutine, saveScoring, saveShowRadar, saveStudios, type SaveState } from "./settings-actions";

function Panel({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="glass space-y-4 rounded-[28px] p-5 md:p-6">
      <div>
        <h2 className="font-serif text-2xl">{title}</h2>
        <p className="text-sm text-ink-soft">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

const input = "glass-input w-full rounded-2xl px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-oxblood/30";

function Save({ pending, state, label = "Save" }: { pending: boolean; state: SaveState; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={pending} className="rounded-full bg-oxblood px-4 py-2 text-sm text-paper transition hover:brightness-110 disabled:opacity-50">
        {pending ? "Saving..." : label}
      </button>
      {state.ok && <span className="text-sm text-emerald-800">{state.ok}</span>}
      {state.error && <span className="text-sm text-destructive">{state.error}</span>}
    </div>
  );
}

export function ClientForm({ s }: { s: Settings["client"] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveClient, {});
  return (
    <Panel title="Client" hint="Who the agent works for. Shown on the profile page and used in every prompt.">
      <form action={action} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Full name"><input name="name" defaultValue={s.name} required className={input} /></Field>
          <Field label="First name"><input name="firstName" defaultValue={s.firstName} required className={input} /></Field>
          <Field label="Pronouns">
            <select name="pronouns" defaultValue={s.pronouns} className={input}>
              <option value="she">she / her</option>
              <option value="he">he / him</option>
              <option value="they">they / them</option>
            </select>
          </Field>
        </div>
        <Field label="Short description" hint="Used in the agent's instructions, e.g. a musical theatre actor-musician based in London">
          <input name="summary" defaultValue={s.summary} className={input} />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Based in"><input name="based" defaultValue={s.based} className={input} /></Field>
          <Field label="Disciplines" hint="Separated by commas"><input name="disciplines" defaultValue={s.disciplines.join(", ")} className={input} /></Field>
        </div>
        <Field label="Photo link" hint="A web address for a portrait, or a file in the app's public folder">
          <input name="portrait" defaultValue={s.portrait} className={input} />
        </Field>
        <Field label="Training" hint="One per line: Course | School">
          <textarea name="training" rows={3} defaultValue={s.training.map((t) => `${t.course} | ${t.school}`).join("\n")} className={input} />
        </Field>
        <Field label="Selected credits" hint="One per line: Show | Role | Where | Year">
          <textarea name="credits" rows={5} defaultValue={s.credits.map((c) => [c.show, c.role, c.where, c.year].join(" | ")).join("\n")} className={input} />
        </Field>
        <Field label="Links" hint="One per line: Label | Web address">
          <textarea name="links" rows={4} defaultValue={s.links.map((l) => `${l.label} | ${l.href}`).join("\n")} className={input} />
        </Field>
        <Save pending={pending} state={state} />
      </form>
    </Panel>
  );
}

export function AgentForm({ s }: { s: Settings["agent"] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveAgent, {});
  return (
    <Panel title="Agent" hint="The agent's name, personality and where it looks for work.">
      <form action={action} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Agent name"><input name="name" defaultValue={s.name} required className={input} /></Field>
          <Field label="Catchphrase" hint="Ends every reply. Leave empty for none."><input name="catchphrase" defaultValue={s.catchphrase} className={input} /></Field>
        </div>
        <Field label="Opening message" hint="The first thing the agent says in a new chat (the catchphrase is added after it)">
          <textarea name="opening" rows={4} defaultValue={s.opening} className={input} />
        </Field>
        <Field label="Tone of voice" hint="How the agent talks in chat">
          <textarea name="tone" rows={3} defaultValue={s.tone} className={input} />
        </Field>
        <Field label="Voice in one line" hint="Used when the agent writes up search results">
          <input name="voice" defaultValue={s.voice} className={input} />
        </Field>
        <Field label="Things to learn about the client" hint="What the agent asks about over time">
          <textarea name="learnTopics" rows={3} defaultValue={s.learnTopics} className={input} />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Kinds of work to search for"><input name="searchFocus" defaultValue={s.searchFocus} className={input} /></Field>
          <Field label="Where to look"><input name="placesToLook" defaultValue={s.placesToLook} className={input} /></Field>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Search from city"><input name="searchCity" defaultValue={s.searchCity} className={input} /></Field>
          <Field label="Country code" hint="Two letters, e.g. GB"><input name="searchCountry" defaultValue={s.searchCountry} maxLength={2} className={input} /></Field>
          <Field label="Time zone"><input name="searchTimezone" defaultValue={s.searchTimezone} className={input} /></Field>
        </div>
        <Save pending={pending} state={state} />
      </form>
    </Panel>
  );
}

export function ScoringForm({ prompt, isOriginal }: { prompt: string; isOriginal: boolean }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveScoring, {});
  const [reset, setReset] = useState(false);
  return (
    <Panel title="Scoring prompt" hint="The instructions used to score every notice from 1 to 10. Already scored notices are not re-scored.">
      <form action={action} className="space-y-4">
        <textarea name="scoringPrompt" rows={8} defaultValue={prompt} className={`${input} font-mono text-xs leading-relaxed`} />
        <input type="hidden" name="reset" value={reset ? "1" : ""} />
        <div className="flex flex-wrap items-center gap-3">
          <Save pending={pending} state={state} />
          {!isOriginal && (
            <button type="submit" onClick={() => setReset(true)} className="glass-chip rounded-full px-4 py-2 text-sm text-ink-soft hover:text-ink">
              Reset to original
            </button>
          )}
          {isOriginal && <span className="text-xs text-ink-soft">Using the original prompt.</span>}
        </div>
      </form>
    </Panel>
  );
}

export function DigestForm({ s, mailer }: { s: Settings["digest"]; mailer: boolean }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveDigest, {});
  return (
    <Panel title="Daily email" hint="A morning round up of the Picks page by email. Off means picks stay in the app only.">
      <form action={action} className="space-y-4">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={s.enabled} className="size-4 accent-[var(--oxblood)]" />
          Send the daily email at 8am
        </label>
        <Field label="Send to" hint="Email addresses, separated by commas">
          <input name="recipients" defaultValue={s.recipients.join(", ")} placeholder="client@example.com" className={input} />
        </Field>
        <p className="text-xs text-ink-soft">Email sending: {mailer ? "connected" : "not connected yet"}.</p>
        <Save pending={pending} state={state} />
      </form>
    </Panel>
  );
}

export function ShowRadarForm({ radar, recast }: { radar: Settings["radar"]; recast: Settings["recast"] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveShowRadar, {});
  return (
    <Panel title="Radar and recast watch" hint="The weekly radar spots newly announced actor-musician shows. The monthly recast watch forecasts when long-running shows, tours and cruise casts change cast. Projects are managed on the Projects tab.">
      <form action={action} className="space-y-4">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="radarEnabled" defaultChecked={radar.enabled} className="size-4 accent-[var(--oxblood)]" />
          Scan for newly announced shows every Monday
        </label>
        <Field label="Theatres and companies to watch" hint="Separated by commas">
          <textarea name="radarVenues" rows={4} defaultValue={radar.venues} className={input} />
        </Field>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="recastEnabled" defaultChecked={recast.enabled} className="size-4 accent-[var(--oxblood)]" />
          Refresh the recast watch on the 1st of each month
        </label>
        <Field label="What to watch for recasts" hint="Shows, tours, houses and cruise lines">
          <textarea name="recastScope" rows={3} defaultValue={recast.scope} className={input} />
        </Field>
        <Save pending={pending} state={state} />
      </form>
    </Panel>
  );
}

export function StudiosForm({ s }: { s: Settings["studios"] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveStudios, {});
  return (
    <Panel title="Studio map" hint="The skills that make this client valuable outside theatre castings, and the markets to look in. Used by the Studios tab.">
      <form action={action} className="space-y-4">
        <Field label="Rare skills" hint="Finish the sentence: the client ...">
          <textarea name="skills" rows={3} defaultValue={s.skills} className={input} />
        </Field>
        <Field label="Markets"><input name="markets" defaultValue={s.markets} className={input} /></Field>
        <Save pending={pending} state={state} />
      </form>
    </Panel>
  );
}

const money = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`;

const MODEL_LABEL: Record<string, string> = {
  "claude-haiku-5-5": "Haiku 5.5 (cheapest)",
  "claude-sonnet-5-5": "Sonnet 5.5 (balanced)",
  "claude-opus-5-5": "Opus 5.5 (most capable, priciest)",
};

export function CostsForm({ s, usage }: { s: Pick<Settings, "models" | "budget" | "filter">; usage: UsageSummary }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveCosts, {});
  const cap = s.budget.monthlyCapUsd;
  const pct = cap > 0 ? Math.min(100, (usage.month / cap) * 100) : 0;
  const opt = (ids: string[]) => ids.map((id) => <option key={id} value={id}>{MODEL_LABEL[id]}</option>);
  return (
    <Panel title="Costs" hint="What Claude has cost this month. It starts again from zero on the 1st of every month, and last month is kept for comparison. Anthropic bills in US dollars. You can put an optional limit on it.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <p className="eyebrow">This month so far</p>
            <p className="font-serif text-5xl tabular-nums leading-none">{money(usage.month)}</p>
          </div>
          <div className="text-sm text-ink-soft">
            {usage.dayOfMonth >= 3 && <p>On track for about {money(usage.projected)} by the end of the month</p>}
            <p>Last month: {money(usage.lastMonth)}</p>
            {cap > 0 && <p>Limit: {money(cap)}</p>}
          </div>
        </div>
        {cap > 0 && (
          <div className="h-2 overflow-hidden rounded-full bg-white/50" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Share of the monthly limit used">
            <div className={`h-full rounded-full ${pct >= 90 ? "bg-destructive" : "bg-oxblood"}`} style={{ width: `${pct}%` }} />
          </div>
        )}
        {usage.byFeature.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing counted yet. Every chat, search and score from now on is added here.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-soft">
                <th className="py-1 font-normal">Where it went</th>
                <th className="py-1 text-right font-normal">Calls</th>
                <th className="py-1 text-right font-normal">Cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.byFeature.map((f) => (
                <tr key={f.feature} className="border-t border-white/60">
                  <td className="py-1.5">{f.label}{f.searches > 0 && <span className="text-xs text-ink-soft"> · {f.searches} web searches</span>}</td>
                  <td className="py-1.5 text-right tabular-nums text-ink-soft">{f.calls}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(f.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form action={action} className="space-y-4 border-t border-white/60 pt-4">
          <Field label="Optional monthly limit (dollars)" hint="0 means no limit: it just counts. With a limit, new Claude work pauses once it is reached, with a clear message.">
            <input name="cap" type="number" min={0} step={1} defaultValue={cap} className={`${input} max-w-40`} />
          </Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Scoring and tidying results" hint="The high volume jobs">
              <select name="modelLight" defaultValue={s.models.light} className={input}>{opt(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"])}</select>
            </Field>
            <Field label="Chat with the agent">
              <select name="modelChat" defaultValue={s.models.chat} className={input}>{opt(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"])}</select>
            </Field>
            <Field label="Web research" hint="Needs web search">
              <select name="modelResearch" defaultValue={s.models.research} className={input}>{opt(["claude-sonnet-5-5", "claude-opus-5-5"])}</select>
            </Field>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="filterEnabled" defaultChecked={s.filter.enabled} className="size-4 accent-[var(--oxblood)]" />
            Skip clearly unrelated notices for free before they are scored
          </label>
          <Field label="Extra words that should always be scored" hint="Separated by commas. Notices containing any of these are never skipped.">
            <input name="filterWords" defaultValue={s.filter.extraWords} className={input} />
          </Field>
          <Save pending={pending} state={state} />
        </form>
      </div>
    </Panel>
  );
}

const ROUTINE_ROWS = [
  { key: "feeds", label: "Check feeds and Instagram" },
  { key: "mail", label: "Check Angel's inbox" },
  { key: "radar", label: "Scan for newly announced shows" },
  { key: "recast", label: "Refresh the recast watch" },
] as const;

export function RoutineForm({ s }: { s: Settings["routine"] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveRoutine, {});
  return (
    <Panel title="Routine jobs" hint="By default nothing paid runs on its own. When a job has not run for its number of days, the app asks on the Picks page and one tap runs it. Switch a job to automatic if you would rather it just ran.">
      <form action={action} className="space-y-3">
        {ROUTINE_ROWS.map((r) => (
          <div key={r.key} className="glass-chip flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl px-4 py-3">
            <p className="min-w-0 flex-1 text-sm font-medium">{r.label}</p>
            <label className="flex items-center gap-2 text-sm">
              Ask every
              <input name={`${r.key}Days`} type="number" min={1} max={365} defaultValue={s[r.key].everyDays} className="glass-input w-16 rounded-full px-3 py-1 text-center text-sm outline-none" />
              days
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={`${r.key}Auto`} defaultChecked={s[r.key].auto} className="size-4 accent-[var(--oxblood)]" />
              Run on its own instead
            </label>
          </div>
        ))}
        <Save pending={pending} state={state} />
      </form>
    </Panel>
  );
}

export function RegionsForm({ s }: { s: Settings["regions"] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveRegions, {});
  const known = ["UK", "Norway", "EU/EEA"];
  const other = s.places.filter((p) => !known.includes(p)).join(", ");
  return (
    <Panel title="Where she can work or apply" hint="Which places count as home turf for castings and funding. Saving rewrites the one line about places in the scoring prompt (shown below), and tells searches where to look.">
      <form action={action} className="space-y-4">
        <div className="flex flex-wrap gap-3">
          {known.map((p) => (
            <label key={p} className="glass-chip flex items-center gap-2 rounded-full px-4 py-2 text-sm">
              <input type="checkbox" name={`place:${p}`} defaultChecked={s.places.includes(p)} className="size-4 accent-[var(--oxblood)]" />
              {p}
            </label>
          ))}
        </div>
        <Field label="Other places" hint="Separated by commas, e.g. Sweden, Australia">
          <input name="otherPlaces" defaultValue={other} className={input} />
        </Field>
        <Field label="Notes for the agent" hint="Anything that affects where work is possible, e.g. lives in London and Oslo, happy to tour, wants to avoid long cruise contracts">
          <textarea name="regionNote" rows={2} defaultValue={s.note} className={input} />
        </Field>
        <Save pending={pending} state={state} />
      </form>
    </Panel>
  );
}
