import { Suspense } from "react";
import { connection } from "next/server";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import type { SourceRow } from "@/lib/sources";
import { SYSTEM_PROMPT } from "@/lib/llm";
import { mailerConfigured } from "@/lib/mailer";
import { inboxConfigured } from "@/lib/mailbox";
import { getSettings } from "@/lib/settings";
import { usageSummary } from "@/lib/usage";
import { AgentForm, ClientForm, CostsForm, DigestForm, RegionsForm, RoutineForm, ScoringForm, ShowRadarForm, StudiosForm } from "./settings-forms";
import { InstagramPanel } from "./instagram-panel";
import { deleteSource, toggleSource } from "./actions";
import { AddSourceCard, RunNowButton } from "./source-forms";


function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not yet";
}

async function SettingsPageContent() {
  await connection(); // shows "last checked" times
  await requireUser();
  const st = await getSettings();
  const usage = await usageSummary(createAdminClient());
  const { data } = await createAdminClient().from("sources").select("*").order("created_at", { ascending: false });
  const sources = (data ?? []) as SourceRow[];


  return (
    <>
      <AppHeader active="settings" />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 className="text-4xl tracking-tight">Set up the agent</h1>
          <p className="text-sm text-ink-soft">
            Everything about the client and the agent lives here, so this app can be set up for someone new by changing these settings.
          </p>
          <p className="mt-2 text-sm">
            <a href="/onboarding" className="text-oxblood underline underline-offset-4">Run the guided setup with {st.agent.name}</a>
            <span className="text-ink-soft"> (who you are, where you can work, what you want)</span>
          </p>
          <nav className="mt-3 flex flex-wrap gap-2 text-xs" aria-label="Settings sections">
            {[
              ["#costs", "Costs"],
              ["#routines", "Routines"],
              ["#regions", "Where she can work"],
              ["#client", "Client"],
              ["#agent", "Agent"],
              ["#show", "Radar and recasts"],
              ["#studios", "Studio map"],
              ["#scoring", "Scoring"],
              ["#email", "Daily email"],
              ["#instagram", "Instagram"],
              ["#sources", "Sources"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="glass-chip rounded-full px-3 py-1.5 text-ink-soft hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
        </div>

        <div id="costs" className="scroll-mt-28"><CostsForm s={{ models: st.models, budget: st.budget, filter: st.filter }} usage={usage} /></div>
        <div id="routines" className="scroll-mt-28"><RoutineForm s={st.routine} /></div>
        <div id="regions" className="scroll-mt-28"><RegionsForm s={st.regions} /></div>
        <div id="client" className="scroll-mt-28"><ClientForm s={st.client} /></div>
        <div id="agent" className="scroll-mt-28"><AgentForm s={st.agent} /></div>
        <div id="show" className="scroll-mt-28"><ShowRadarForm radar={st.radar} recast={st.recast} /></div>
        <div id="studios" className="scroll-mt-28"><StudiosForm s={st.studios} /></div>
        <div id="scoring" className="scroll-mt-28"><ScoringForm prompt={st.scoringPrompt} isOriginal={st.scoringPrompt === SYSTEM_PROMPT} /></div>
        <div id="email" className="scroll-mt-28"><DigestForm s={st.digest} mailer={mailerConfigured()} /></div>
        <div id="instagram" className="scroll-mt-28"><InstagramPanel /></div>

        <div id="sources" className="flex scroll-mt-28 flex-wrap items-end justify-between gap-4 pt-4">
          <div>
            <h2 className="font-serif text-3xl">Sources</h2>
            <p className="text-sm text-ink-soft">Where the agent looks for castings and funding.</p>
          </div>
          <RunNowButton />
        </div>

        <AddSourceCard />

        <Card>
          <CardHeader>
            <CardTitle>Your sources</CardTitle>
            <CardDescription>{sources.length} added. Paused sources are skipped.</CardDescription>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing added yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Last checked</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((s) => (
                    <TableRow key={s.id} className={s.status === "inactive" ? "opacity-60" : undefined}>
                      <TableCell className="max-w-xs">
                        <div className="font-medium">{s.label || s.value}</div>
                        <div className="truncate text-xs text-muted-foreground" title={s.inbound_address ?? s.value}>
                          {s.type === "EMAIL_LIST" ? s.inbound_address : s.type === "AGENT_SEARCH" ? "Web searches from the chat" : s.type === "INSTAGRAM_ACCOUNT" ? `instagram.com/${s.value}` : s.value}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.type === "EMAIL_LIST" ? "Email" : s.type === "AGENT_SEARCH" ? "Agent finds" : s.type === "INSTAGRAM_ACCOUNT" ? "Instagram" : s.handle ? "Instagram (RSS)" : "RSS"}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{when(s.last_fetched_at)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <form action={toggleSource}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="status" value={s.status} />
                            <Button type="submit" variant="ghost" size="sm">{s.status === "active" ? "Pause" : "Resume"}</Button>
                          </form>
                          <form action={deleteSource}>
                            <input type="hidden" name="id" value={s.id} />
                            <Button type="submit" variant="ghost" size="sm" className="text-destructive">Remove</Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mailing list inbox</CardTitle>
            <CardDescription>Where casting newsletters are sent so Angel can read them. You never see these emails.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {inboxConfigured() ? (
              <>
                <p>
                  <span className="font-medium">Connected:</span> <code className="rounded bg-white/60 px-1.5 py-0.5">{process.env.IMAP_USER}</code>
                </p>
                <p className="text-ink-soft">
                  Subscribe to a newsletter with a plus address, for example{" "}
                  <code className="rounded bg-white/60 px-1.5 py-0.5">{process.env.IMAP_USER?.replace("@", "+spotlight@")}</code>. Any new name becomes a new list by
                  itself. Angel reads the inbox when you tap Run it now on Picks, scores what it finds, and files each message away.
                </p>
              </>
            ) : (
              <>
                <p className="text-ink-soft">
                  Not connected yet. Angel needs its own mailbox, separate from your everyday one: a new free Gmail address with 2-step verification and an app
                  password. Ask Claude to connect it.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-muted-foreground">Loading...</p>}>
      <SettingsPageContent />
    </Suspense>
  );
}
