import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Check } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { getSettings, placesPhrase } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { saveWantsStep, startChatWithAngel } from "./actions";
import { ProfileStep, RegionsStep } from "./onboarding-client";

const STEPS = ["Who you are", "Where you can work", "What you want", "Meet Angel"];

const WORK_TYPES = [
  "Musical theatre",
  "Actor-musician shows",
  "Plays",
  "New writing and devising",
  "Screen (TV and film)",
  "Commercials",
  "Voice and dubbing",
  "Concerts and cabaret",
  "Cruise and ferry shows",
  "Immersive and site specific",
  "Teaching and workshops",
  "Funding for my own work",
];

function Choice({ name, label }: { name: string; label: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {[
          ["yes", "Yes"],
          ["maybe", "It depends"],
          ["no", "No"],
        ].map(([v, l]) => (
          <label key={v} className="glass-chip flex items-center gap-2 rounded-full px-4 py-2 text-sm has-[:checked]:bg-oxblood has-[:checked]:text-paper">
            <input type="radio" name={name} value={v} className="sr-only" />
            {l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

async function OnboardingContent({ searchParams }: { searchParams: Promise<{ step?: string; error?: string }> }) {
  await connection();
  await requireUser();
  const [{ step: rawStep, error }, st] = await Promise.all([searchParams, getSettings()]);
  const step = Math.min(4, Math.max(1, Number(rawStep) || 1));
  const agent = st.agent.name;
  const db = createAdminClient();
  const { data: facts } = step === 4 ? await db.from("profile_facts").select("fact, source").eq("active", true).order("created_at") : { data: [] };

  return (
    <>
      <AppHeader active="settings" />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <div className="space-y-3">
          <p className="eyebrow">Getting started with {agent}</p>
          <h1 className="text-4xl tracking-tight">{step === 4 ? "You're all set" : `Hi, I'm ${agent}`}</h1>
          <p className="max-w-xl text-sm text-ink-soft">
            {step === 4
              ? "Here is what I know now. You can change any of it later in Settings or by chatting with me."
              : "A few quick steps so I know who you are and where you want to work. It takes about three minutes, and you can change everything later."}
          </p>
          <ol className="flex flex-wrap gap-2" aria-label="Steps">
            {STEPS.map((label, i) => {
              const n = i + 1;
              return (
                <li key={label}>
                  <Link
                    href={`/onboarding?step=${n}`}
                    aria-current={n === step ? "step" : undefined}
                    className={cn("inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs", n === step ? "bg-oxblood text-paper" : "glass-chip text-ink-soft")}
                  >
                    {n < step ? <Check className="size-3.5" aria-hidden /> : <span>{n}</span>}
                    {label}
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>

        {error === "profile" && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Something in the details was not valid, so nothing was saved. Check the links start with https:// and try again.</p>}

        {step === 1 && <ProfileStep current={st.client} agentName={agent} />}
        {step === 2 && <RegionsStep s={st.regions} />}
        {step === 3 && (
          <form action={saveWantsStep} className="glass space-y-6 rounded-[28px] p-5 md:p-6">
            <div>
              <h2 className="font-serif text-2xl">What work do you want?</h2>
              <p className="text-sm text-ink-soft">Tick everything you would like to hear about.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {WORK_TYPES.map((t) => (
                <label key={t} className="glass-chip flex items-center gap-2 rounded-full px-4 py-2 text-sm has-[:checked]:bg-oxblood has-[:checked]:text-paper">
                  <input type="checkbox" name="type" value={t} className="sr-only" />
                  {t}
                </label>
              ))}
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              <Choice name="touring" label="Happy to tour?" />
              <Choice name="relocate" label="Happy to relocate?" />
              <Choice name="cruise" label="Cruise and ferry shows?" />
            </div>
            {[
              ["dealbreakers", "Deal-breakers", "Anything you would never take, e.g. unpaid work, nudity, long contracts"],
              ["availability", "Availability", "e.g. free from February, busy in August"],
              ["excited", "What excites you most", "The kind of project that would make you say yes straight away"],
            ].map(([name, label, hint]) => (
              <label key={name} className="block space-y-1.5">
                <span className="text-sm font-medium">{label}</span>
                <textarea name={name} rows={2} className="glass-input w-full rounded-2xl px-3.5 py-2 text-sm outline-none focus:ring-2 focus:ring-oxblood/30" />
                <span className="block text-xs text-ink-soft">{hint}</span>
              </label>
            ))}
            <button type="submit" className="rounded-full bg-oxblood px-5 py-2.5 text-sm text-paper transition hover:brightness-110">Save and finish</button>
          </form>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <section className="glass space-y-2 rounded-[28px] p-5 md:p-6">
              <h2 className="font-serif text-2xl">{st.client.name}</h2>
              <p className="text-sm text-ink-soft">{st.client.summary}</p>
              <p className="text-sm">
                <span className="font-medium">Can work and apply in:</span> {placesPhrase(st.regions.places)}
              </p>
            </section>
            <section className="glass space-y-2 rounded-[28px] p-5 md:p-6">
              <h2 className="font-serif text-xl">Notes I will use ({facts?.length ?? 0})</h2>
              <ul className="space-y-1.5 text-sm">
                {(facts ?? []).map((f, i) => (
                  <li key={i} className="glass-chip rounded-2xl px-3 py-2">{f.fact as string}</li>
                ))}
              </ul>
            </section>
            <form action={startChatWithAngel} className="flex flex-wrap items-center gap-3">
              <button type="submit" className="rounded-full bg-oxblood px-5 py-2.5 text-sm text-paper transition hover:brightness-110">Start chatting with {agent}</button>
              <Link href="/settings" className="text-sm text-ink-soft underline-offset-4 hover:underline">Open Settings</Link>
            </form>
          </div>
        )}
      </main>
    </>
  );
}

export default function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; error?: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-ink-soft">Loading...</p>}>
      <OnboardingContent searchParams={searchParams} />
    </Suspense>
  );
}
