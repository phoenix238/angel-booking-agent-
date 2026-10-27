import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowUpRight } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { angelAddress } from "@/lib/inbound";
import { mailerConfigured } from "@/lib/mailer";
import { inboxConfigured } from "@/lib/mailbox";
import { baseDomain } from "@/lib/confirm";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { deadlineLabel } from "@/lib/tracker";
import { cn } from "@/lib/utils";
import { dismissSuggestion, markConfirmDone, toggleAutoConfirm } from "./actions";
import { CheckInboxButton, CopyAddress, DigestToggle, FindListsButton, JoinButton } from "./emails-client";

// "Find lists" runs as a server action on this page and takes a few minutes.
export const maxDuration = 300;

type EmailRow = {
  id: string;
  source_id: string | null;
  subject: string | null;
  from_name: string | null;
  from_addr: string | null;
  received_at: string;
  kind: string;
  summary: string | null;
  item_count: number;
  match_count: number;
  confirm_url: string | null;
  unsubscribe_url: string | null;
  handled: boolean;
  confirm_status: string | null;
  confirm_note: string | null;
};
type Item = { id: string; email_id: string; title: string; company: string | null; url: string | null; match_score: number; deadline: string | null; deadline_text: string | null };
type Suggestion = { id: string; name: string; organisation: string | null; kind: string; what_it_sends: string | null; why: string | null; signup_url: string; cost: string; status: string; source_id: string | null };

const KIND_LABEL: Record<string, string> = { casting: "Casting", funding: "Funding", venue: "Theatre or company", other: "Other" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const domainOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
};

async function EmailsContent() {
  await connection();
  const user = await requireUser();
  const st = await getSettings();
  const db = createAdminClient();
  const address = angelAddress();
  const imap = inboxConfigured();

  const [{ data: emailData }, { data: suggData }, { data: sourceData }] = await Promise.all([
    db.from("emails").select("*").order("received_at", { ascending: false }).limit(80),
    db.from("list_suggestions").select("*").neq("status", "dismissed").order("created_at", { ascending: false }),
    db.from("sources").select("id, label, value, status").eq("type", "EMAIL_LIST").order("created_at", { ascending: false }),
  ]);
  const emails = (emailData ?? []) as EmailRow[];
  const suggestions = (suggData ?? []) as Suggestion[];
  const sources = (sourceData ?? []) as { id: string; label: string | null; value: string; status: string }[];
  const sourceName = (id: string | null) => sources.find((s) => s.id === id)?.label ?? sources.find((s) => s.id === id)?.value ?? "A list";
  const joinedSourceIds = new Set(suggestions.filter((s) => s.status === "joined" && s.source_id).map((s) => s.source_id as string));

  const newsletters = emails.filter((e) => e.kind === "newsletter").slice(0, 25);
  const { data: itemData } = newsletters.length
    ? await db
        .from("auditions")
        .select("id, email_id, title, company, url, match_score, deadline, deadline_text")
        .in("email_id", newsletters.map((e) => e.id))
        .order("match_score", { ascending: false })
    : { data: [] };
  const items = (itemData ?? []) as Item[];

  const needsYou = emails.filter((e) => e.kind === "confirm" && !e.handled);
  const confirmedByAngel = emails.filter((e) => e.kind === "confirm" && e.confirm_status === "auto_done").slice(0, 5);
  const offers = suggestions.filter((s) => s.status === "suggested");
  const joined = suggestions.filter((s) => s.status === "joined");
  const myEmail = (user.email ?? "").toLowerCase();
  const on = st.digest.recipients.map((r) => r.toLowerCase()).includes(myEmail);

  return (
    <>
      <AppHeader active="emails" />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-8">
        <div className="space-y-3">
          <p className="eyebrow">Newsletters read by {st.agent.name}</p>
          <h1 className="text-4xl tracking-tight">Email digest</h1>
          <p className="max-w-2xl text-sm text-ink-soft">
            Join casting and funding lists with {st.agent.name}&apos;s own address. She confirms the subscriptions, reads every email, picks out the opportunities that fit and
            scores them. You never need to open the emails.
          </p>
        </div>

        <section className="glass space-y-3 rounded-[28px] p-5 md:p-6">
          <h2 className="font-serif text-2xl">{st.agent.name}&apos;s email address</h2>
          {address ? (
            <>
              <CopyAddress address={address} />
              <p className="text-sm text-ink-soft">Paste this into any newsletter sign-up form. Angel recognises each list by who sends it.</p>
              {imap && <CheckInboxButton />}
            </>
          ) : (
            <p className="text-sm text-ink-soft">Angel&apos;s address is not set up yet. Once it is, it will show here with a Copy button, and every Join button below will work.</p>
          )}
          <form action={toggleAutoConfirm} className="flex flex-wrap items-center gap-3 border-t border-white/60 pt-3 text-sm">
            <input type="hidden" name="on" value={String(!st.inbox.autoConfirm)} />
            <span>
              Angel confirms subscriptions herself: <span className="font-medium">{st.inbox.autoConfirm ? "on" : "off"}</span>
            </span>
            <button type="submit" className="glass-chip rounded-full px-3 py-1 text-xs hover:bg-white/70">{st.inbox.autoConfirm ? "Switch off" : "Switch on"}</button>
            <span className="text-xs text-ink-soft">She only opens secure links on the sender&apos;s own site or a known mailing service, and never anything that looks like unsubscribing.</span>
          </form>
        </section>

        <section className="glass space-y-3 rounded-[28px] p-5 md:p-6">
          <h2 className="font-serif text-2xl">Get this digest in your own email</h2>
          <DigestToggle on={on} email={myEmail} canSend={mailerConfigured()} recipients={st.digest.recipients} />
        </section>

        {needsYou.length > 0 && (
          <section className="space-y-3" aria-labelledby="needs-h">
            <h2 id="needs-h" className="font-serif text-2xl">Needs you</h2>
            <ul className="glass divide-y divide-white/60 rounded-[28px]">
              {needsYou.map((e) => {
                const trusted = e.source_id ? joinedSourceIds.has(e.source_id) : false;
                return (
                  <li key={e.id} className="space-y-2 px-5 py-4">
                    <p className="font-medium">Confirm your subscription to {e.from_name || sourceName(e.source_id)}</p>
                    {e.confirm_note && <p className="text-sm text-ink-soft">{e.confirm_note}</p>}
                    <div className="flex flex-wrap items-center gap-3">
                      {e.confirm_url && trusted ? (
                        <a href={e.confirm_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-oxblood px-4 py-2 text-sm text-paper hover:brightness-110">
                          Open the confirm page ({baseDomain(domainOf(e.confirm_url))}) <ArrowUpRight className="size-3.5" />
                        </a>
                      ) : e.confirm_url ? (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-oxblood">I signed up for this: show the confirm link</summary>
                          <a href={e.confirm_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 underline">
                            {domainOf(e.confirm_url)} <ArrowUpRight className="size-3.5" />
                          </a>
                          <p className="text-xs text-ink-soft">Only open this if you signed up. It goes to {domainOf(e.confirm_url)}.</p>
                        </details>
                      ) : null}
                      <form action={markConfirmDone}>
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit" className="glass-chip rounded-full px-3 py-1.5 text-xs text-ink-soft hover:text-ink">Done</button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="font-serif text-2xl">Latest from your lists</h2>
          {confirmedByAngel.length > 0 && (
            <ul className="space-y-1 text-xs text-ink-soft">
              {confirmedByAngel.map((e) => (
                <li key={e.id}>
                  Angel confirmed {e.from_name || sourceName(e.source_id)} on {day(e.received_at)}.
                </li>
              ))}
            </ul>
          )}
          {newsletters.length === 0 ? (
            <p className="glass rounded-[28px] p-6 text-sm text-ink-soft">No newsletters yet. Join a list below and the first email will appear here.</p>
          ) : (
            <div className="space-y-4">
              {newsletters.map((e) => {
                const mine = items.filter((i) => i.email_id === e.id);
                return (
                  <article key={e.id} className="glass space-y-3 rounded-[28px] p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <p className="eyebrow">{e.from_name || sourceName(e.source_id)} · {day(e.received_at)}</p>
                        <h3 className="font-serif text-xl leading-snug">{e.subject || "No subject"}</h3>
                      </div>
                      <span className="text-xs text-ink-soft">{e.item_count} opportunit{e.item_count === 1 ? "y" : "ies"}, {e.match_count} strong</span>
                    </div>
                    {e.summary && <p className="text-sm text-ink-soft">{e.summary}</p>}
                    {mine.length > 0 && (
                      <ul className="divide-y divide-white/60 rounded-2xl bg-white/40 px-3">
                        {mine.map((i) => (
                          <li key={i.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5 text-sm">
                            <span className={cn("mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", i.match_score >= 8 ? "bg-oxblood text-paper" : i.match_score >= 7 ? "bg-oxblood/15 text-oxblood" : "bg-white/60 text-ink-soft")}>
                              {i.match_score}/10
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">{i.title}</span>
                              {i.company && <span className="text-ink-soft"> · {i.company}</span>}
                              {(i.deadline || i.deadline_text) && (
                                <span className="block text-xs text-ink-soft">{i.deadline ? deadlineLabel(i.deadline) : `Deadline: ${i.deadline_text}`}</span>
                              )}
                            </span>
                            {i.url && (
                              <a href={i.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs text-ink-soft hover:text-ink">
                                Open <ArrowUpRight className="size-3" />
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {e.unsubscribe_url && (
                      <a href={e.unsubscribe_url} target="_blank" rel="noopener noreferrer" className="text-xs text-ink-soft underline-offset-4 hover:underline">
                        Leave this list
                      </a>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="font-serif text-2xl">Lists Angel suggests</h2>
            <p className="text-xs text-ink-soft">
              Join opens the sign-up page and copies Angel&apos;s address. Angel can&apos;t fill in other people&apos;s forms for you, but she does the confirming.
            </p>
          </div>
          <FindListsButton />
          {offers.length === 0 ? (
            <p className="glass rounded-[28px] p-6 text-sm text-ink-soft">No suggestions yet. Press Find lists to join.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {offers.map((s) => (
                <article key={s.id} className="glass flex flex-col gap-2 rounded-[28px] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="eyebrow">{KIND_LABEL[s.kind] ?? "List"}{s.cost !== "free" ? ` · ${s.cost}` : " · free"}</p>
                      <h3 className="font-serif text-xl leading-snug">{s.name}</h3>
                      {s.organisation && <p className="text-xs text-ink-soft">{s.organisation}</p>}
                    </div>
                  </div>
                  {s.what_it_sends && <p className="text-sm">Sends: {s.what_it_sends}</p>}
                  {s.why && <p className="text-sm text-ink-soft">{s.why}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                    <JoinButton suggestionId={s.id} name={s.name} url={s.signup_url} address={address} compact />
                    <form action={dismissSuggestion}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className="glass-chip rounded-full px-3 py-1.5 text-xs text-ink-soft hover:text-ink">Not interested</button>
                    </form>
                    <a href={s.signup_url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-0.5 text-xs text-ink-soft hover:text-ink">
                      {domainOf(s.signup_url)} <ArrowUpRight className="size-3" />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {joined.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-serif text-2xl">Lists you have joined</h2>
            <ul className="glass divide-y divide-white/60 rounded-[28px] px-2">
              {joined.map((s) => {
                const mine = emails.filter((e) => e.source_id === s.source_id);
                const last = mine[0];
                return (
                  <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-3 text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-ink-soft">
                      {last ? `${mine.length} email${mine.length === 1 ? "" : "s"}, last ${day(last.received_at)}` : "Waiting for the first email"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

export default function EmailsPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-sm text-ink-soft">Loading...</p>}>
      <EmailsContent />
    </Suspense>
  );
}
