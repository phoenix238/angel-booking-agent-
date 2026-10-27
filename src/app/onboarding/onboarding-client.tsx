"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import type { Settings } from "@/lib/settings";
import { saveRegions } from "../settings/settings-actions";
import { readWebsite, saveProfileStep, saveRegionsStep, type ReadState } from "./actions";

const input = "glass-input w-full rounded-2xl px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-oxblood/30";
const primary = "rounded-full bg-oxblood px-5 py-2.5 text-sm text-paper transition hover:brightness-110 disabled:opacity-50";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

type Draft = {
  name: string;
  firstName: string;
  pronouns: string;
  summary: string;
  based: string;
  disciplines: string;
  training: string;
  credits: string;
  links: string;
  facts: string;
  questions: string;
};

function fromSettings(c: Settings["client"]): Draft {
  return {
    name: c.name,
    firstName: c.firstName,
    pronouns: c.pronouns,
    summary: c.summary,
    based: c.based,
    disciplines: c.disciplines.join(", "),
    training: c.training.map((t) => `${t.course} | ${t.school}`).join("\n"),
    credits: c.credits.map((x) => [x.show, x.role, x.where, x.year].join(" | ")).join("\n"),
    links: c.links.map((l) => `${l.label} | ${l.href}`).join("\n"),
    facts: "",
    questions: "",
  };
}

export function ProfileStep({ current, agentName }: { current: Settings["client"]; agentName: string }) {
  const [state, action, pending] = useActionState<ReadState, FormData>(readWebsite, {});
  const d: Draft = state.draft
    ? {
        name: state.draft.name,
        firstName: state.draft.first_name,
        pronouns: state.draft.pronouns,
        summary: state.draft.summary,
        based: state.draft.based,
        disciplines: state.draft.disciplines.join(", "),
        training: state.draft.training.map((t) => `${t.course} | ${t.school}`).join("\n"),
        credits: state.draft.credits.map((x) => [x.show, x.role, x.where, x.year].join(" | ")).join("\n"),
        links: state.draft.links.map((l) => `${l.label} | ${l.href}`).join("\n"),
        facts: state.draft.facts.join("\n"),
        questions: state.draft.questions.join("\n"),
      }
    : fromSettings(current);

  return (
    <div className="space-y-6">
      <form action={action} className="glass space-y-3 rounded-[28px] p-5 md:p-6">
        <h2 className="font-serif text-2xl">Let {agentName} read your website</h2>
        <p className="text-sm text-ink-soft">Paste a link to your own site or profile page. {agentName} reads it and fills the boxes below. You check and change anything before it is saved.</p>
        <div className="flex flex-wrap gap-2">
          <input name="url" placeholder="https://yourname.com" aria-label="Link to your website" defaultValue={state.url ?? ""} className={`${input} min-w-0 flex-1`} />
          <button type="submit" disabled={pending} className={`${primary} inline-flex items-center gap-1.5`}>
            <Sparkles className="size-4" aria-hidden />
            {pending ? "Reading..." : "Read my website"}
          </button>
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state.draft && <p className="text-sm text-emerald-800">Done. Check the details below, then save.</p>}
      </form>

      <form action={saveProfileStep} key={state.url ?? "manual"} className="glass space-y-4 rounded-[28px] p-5 md:p-6">
        <h2 className="font-serif text-2xl">Who you are</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Full name"><input name="name" defaultValue={d.name} required className={input} /></Field>
          <Field label="First name"><input name="firstName" defaultValue={d.firstName} required className={input} /></Field>
          <Field label="Pronouns">
            <select name="pronouns" defaultValue={d.pronouns} className={input}>
              <option value="she">she / her</option>
              <option value="he">he / him</option>
              <option value="they">they / them</option>
            </select>
          </Field>
        </div>
        <Field label="In one line" hint="e.g. a musical theatre actor-musician based in London and Oslo">
          <input name="summary" defaultValue={d.summary} className={input} />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Based in"><input name="based" defaultValue={d.based} className={input} /></Field>
          <Field label="What you do" hint="Separated by commas"><input name="disciplines" defaultValue={d.disciplines} className={input} /></Field>
        </div>
        <Field label="Training" hint="One per line: Course | School">
          <textarea name="training" rows={3} defaultValue={d.training} className={input} />
        </Field>
        <Field label="Selected credits" hint="One per line: Show | Role | Where | Year">
          <textarea name="credits" rows={5} defaultValue={d.credits} className={input} />
        </Field>
        <Field label="Links" hint="One per line: Label | Web address">
          <textarea name="links" rows={4} defaultValue={d.links} className={input} />
        </Field>
        {state.draft && (
          <>
            <Field label={`Other things ${agentName} learned`} hint="One per line. These become notes that guide every score. Remove anything wrong.">
              <textarea name="facts" rows={5} defaultValue={d.facts} className={input} />
            </Field>
            <Field label={`What ${agentName} still wants to ask you`} hint="One per line. She will ask these in the chat.">
              <textarea name="questions" rows={4} defaultValue={d.questions} className={input} />
            </Field>
          </>
        )}
        <button type="submit" className={primary}>Save and continue</button>
      </form>
    </div>
  );
}

export function RegionsStep({ s }: { s: Settings["regions"] }) {
  const [state, action, pending] = useActionState(saveRegionsStep, {});
  const known = ["UK", "Norway", "EU/EEA"];
  void saveRegions;
  return (
    <form action={action} className="glass space-y-4 rounded-[28px] p-5 md:p-6">
      <h2 className="font-serif text-2xl">Where can you work or apply?</h2>
      <p className="text-sm text-ink-soft">Tick every place you could realistically take a job or a grant in. This decides what counts as home turf when work is scored.</p>
      <div className="flex flex-wrap gap-3">
        {known.map((p) => (
          <label key={p} className="glass-chip flex items-center gap-2 rounded-full px-4 py-2 text-sm">
            <input type="checkbox" name={`place:${p}`} defaultChecked={s.places.includes(p)} className="size-4 accent-[var(--oxblood)]" />
            {p}
          </label>
        ))}
      </div>
      <Field label="Other places" hint="Separated by commas, e.g. Sweden, Australia">
        <input name="otherPlaces" defaultValue={s.places.filter((p) => !known.includes(p)).join(", ")} className={input} />
      </Field>
      <Field label="Anything that affects it" hint="e.g. lives in London and Oslo, needs visa sponsorship outside Europe">
        <textarea name="regionNote" rows={2} defaultValue={s.note} className={input} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primary}>{pending ? "Saving..." : "Save and continue"}</button>
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
      </div>
    </form>
  );
}
