import { Suspense } from "react";
import { connection } from "next/server";
import Image from "next/image";
import { ArrowUpRight, X } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { getChatHistory } from "@/lib/agent-chat";
import { getSettings, openingMessage } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import type { FactRow } from "@/lib/facts";
import { addFact, clearChat, setFactActive } from "./actions";
import { angelAddress } from "@/lib/inbound";
import { AgentChat } from "./agent-chat";

// Agent Angel's web search runs in a server action on this page and can take a few minutes.
export const maxDuration = 300;

const SOURCE_LABEL: Record<FactRow["source"], string> = { website: "Website", interview: "Interview", manual: "Added" };

async function ProfileContent() {
  await connection(); // deadlines are worked out from today's date
  await requireUser();
  const db = createAdminClient();
  const [st, { data: factData }, history] = await Promise.all([
    getSettings(),
    db.from("profile_facts").select("*").eq("active", true).order("created_at"),
    getChatHistory(db),
  ]);
  const facts = (factData ?? []) as FactRow[];
  const client = st.client;
  const agentName = st.agent.name;

  return (
    <>
      <AppHeader active="profile" />
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="space-y-6">
          <div className="glass overflow-hidden rounded-[32px]">
            <div className="relative aspect-[4/5] bg-oxblood">
              {client.portrait && <Image src={client.portrait} alt={`${client.name}, studio portrait`} fill priority sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover object-[center_30%]" />}
              <div className="absolute inset-0 bg-gradient-to-t from-oxblood/85 via-oxblood/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-paper">
                <p className="eyebrow text-paper/80">Profile</p>
                <h1 className="font-serif text-5xl leading-[0.9] tracking-tight">{client.name}</h1>
                <p className="mt-3 text-sm">{client.disciplines.join(" · ")}</p>
                <p className="text-sm text-paper/80">Based in {client.based}</p>
              </div>
            </div>
            <div className="space-y-5 p-6">
              <div>
                <p className="eyebrow mb-2">Training</p>
                <ul className="space-y-1 text-sm">
                  {client.training.map((t) => (
                    <li key={t.course}>
                      <span className="font-medium">{t.course}</span> <span className="text-ink-soft">· {t.school}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow mb-2">Selected credits</p>
                <ul className="divide-y divide-line/60 text-sm">
                  {client.credits.map((c) => (
                    <li key={c.show} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span>
                        <span className="font-serif text-base italic">{c.show}</span>
                        <span className="text-ink-soft"> · {c.role}</span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-soft">{c.year}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                {client.links.map((l) => (
                  <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="glass-chip inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs hover:bg-white/70">
                    {l.label} <ArrowUpRight className="size-3" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="glass rounded-[32px] p-6">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-serif text-2xl">What {agentName} knows</h2>
              <span className="text-xs text-ink-soft">{facts.length} notes</span>
            </div>
            <p className="mb-4 text-xs text-ink-soft">These notes guide every score. Remove anything that is wrong.</p>
            <ul className="space-y-2">
              {facts.map((f) => (
                <li key={f.id} className="glass-chip group flex items-start gap-2 rounded-2xl px-3 py-2 text-sm">
                  <span className="flex-1">{f.fact}</span>
                  <span className="mt-0.5 shrink-0 text-[10px] uppercase tracking-wider text-ink-soft">{SOURCE_LABEL[f.source]}</span>
                  <form action={setFactActive.bind(null, f.id, false)}>
                    <button type="submit" aria-label="Remove this note" className="rounded-full p-0.5 text-ink-soft hover:bg-white/70 hover:text-oxblood">
                      <X className="size-3.5" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addFact} className="glass-input mt-4 flex gap-2 rounded-full p-1.5 pl-4">
              <input name="fact" placeholder="Add a note, e.g. Fluent in French" className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-soft" />
              <button type="submit" className="rounded-full bg-ink px-4 py-1.5 text-xs text-paper hover:bg-oxblood">Add</button>
            </form>
          </div>
        </section>

        <section className="glass flex flex-col rounded-[32px] p-5 lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
          <div className="mb-4 flex items-center justify-between px-1">
            <div>
              <p className="eyebrow">{agentName}</p>
              <h2 className="font-serif text-3xl">Let&apos;s talk about your next job</h2>
            </div>
            {history.length > 0 && (
              <form action={clearChat}>
                <button type="submit" className="text-xs text-ink-soft underline-offset-4 hover:underline">Start over</button>
              </form>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <AgentChat initial={history.map((m) => ({ role: m.role, content: m.content, finds: m.finds }))} opening={openingMessage(st)} agentName={agentName} address={angelAddress()} />
          </div>
        </section>
      </main>
    </>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-ink-soft">Loading...</p>}>
      <ProfileContent />
    </Suspense>
  );
}
