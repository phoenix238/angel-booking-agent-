"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, ArrowUpRight, AtSign, Check, Search, Sparkles, Undo2 } from "lucide-react";
import type { Find } from "@/lib/agent-search";
import { cn } from "@/lib/utils";
import { JoinButton } from "../emails/emails-client";
import { findOpportunities, sendChatMessage, setFactActive, watchInstagram } from "./actions";

type Line =
  | { kind: "msg"; role: "user" | "assistant"; text: string; finds?: Find[] | null }
  | { kind: "noted"; id: string; fact: string; undone?: boolean };

type InitialMessage = { role: "user" | "assistant"; content: string; finds?: Find[] | null };

const KIND_LABEL: Record<Find["kind"], string> = {
  audition: "Audition",
  grant: "Grant",
  mailing_list: "Mailing list",
  instagram_account: "Instagram account",
  other: "Opportunity",
};

function WatchButton({ handle }: { handle: string }) {
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (done) return <span className="text-xs text-ink-soft">{done}</span>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => setDone((await watchInstagram(handle)).message))}
      className="inline-flex items-center gap-1 rounded-full bg-oxblood px-3 py-1.5 text-xs text-paper transition hover:brightness-110 disabled:opacity-50"
    >
      <AtSign className="size-3.5" /> {pending ? "Adding..." : "Watch on Instagram"}
    </button>
  );
}

function FindCard({ f, address }: { f: Find; address: string | null }) {
  const isList = f.kind === "mailing_list";
  const isInsta = f.kind === "instagram_account" && Boolean(f.instagram_handle);
  return (
    <div className="glass-chip flex flex-col gap-2 rounded-3xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{KIND_LABEL[f.kind]}</p>
          <p className="font-serif text-lg leading-snug">{f.title}</p>
          <p className="text-xs text-ink-soft">{f.organisation}{f.location ? ` · ${f.location}` : ""}</p>
        </div>
        {typeof f.score === "number" && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums",
              f.score >= 8 ? "bg-oxblood text-paper" : f.score >= 7 ? "bg-oxblood/15 text-oxblood" : "bg-white/60 text-ink-soft",
            )}
            title="Match score out of 10"
          >
            {f.score}/10
          </span>
        )}
      </div>
      <p className="text-sm">{f.why}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-ink-soft">
        <span>
          {f.deadline && `Deadline: ${f.deadline}`}
          {!isList && f.saved && typeof f.score === "number" && (f.score >= 7 ? " · Saved to Matches" : " · Kept out of Matches")}
        </span>
        {isInsta && <WatchButton handle={f.instagram_handle} />}
        {isList && <JoinButton name={f.title} url={f.url} organisation={f.organisation} address={address} compact />}
        <a
          href={f.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-paper transition hover:bg-oxblood"
        >
          Open <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

export function AgentChat({ initial, opening, agentName, address }: { initial: InitialMessage[]; opening: string; agentName: string; address: string | null }) {
  const [lines, setLines] = useState<Line[]>(() =>
    (initial.length ? initial : [{ role: "assistant" as const, content: opening }]).map((m) => ({
      kind: "msg" as const,
      role: m.role,
      text: m.content,
      finds: m.finds,
    })),
  );
  const [options, setOptions] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = pending || searching;
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, busy]);

  async function search(brief: string) {
    setSearching(true);
    setOptions([]);
    setError(null);
    try {
      const res = await findOpportunities(brief);
      if (!res.ok) setError(res.error);
      else setLines((l) => [...l, { kind: "msg", role: "assistant", text: res.message, finds: res.finds }]);
    } catch {
      setError("The search did not finish. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setOptions([]);
    setError(null);
    setLines((l) => [...l, { kind: "msg", role: "user", text: message }]);
    startTransition(async () => {
      const res = await sendChatMessage(message);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLines((l) => [
        ...l,
        ...res.learned.map((f) => ({ kind: "noted" as const, id: f.id, fact: f.fact })),
        { kind: "msg" as const, role: "assistant" as const, text: res.reply },
      ]);
      if (res.search) void search(res.search);
      else setOptions(res.options);
    });
  }

  function toggleNoted(id: string, undone: boolean) {
    setLines((l) => l.map((x) => (x.kind === "noted" && x.id === id ? { ...x, undone } : x)));
    startTransition(() => setFactActive(id, !undone));
  }

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-1 pb-4" aria-live="polite">
        {lines.map((line, i) =>
          line.kind === "noted" ? (
            <div key={line.id} className={cn("flex items-center gap-2 pl-1 text-xs text-ink-soft", line.undone && "line-through opacity-60")}>
              <Check className="size-3.5 text-oxblood" aria-hidden />
              <span className="flex-1">Noted: {line.fact}</span>
              <button
                type="button"
                onClick={() => toggleNoted(line.id, !line.undone)}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 hover:bg-white/50"
              >
                <Undo2 className="size-3" aria-hidden /> {line.undone ? "Keep" : "Undo"}
              </button>
            </div>
          ) : (
            <div key={i} className="space-y-3">
              <div className={cn("flex", line.role === "user" ? "justify-end" : "justify-start")}>
                <p
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed",
                    line.role === "user" ? "bg-oxblood text-paper rounded-br-lg" : "glass-chip rounded-bl-lg",
                  )}
                >
                  {line.text}
                </p>
              </div>
              {line.finds && line.finds.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {line.finds.map((f) => (
                    <FindCard key={f.url} f={f} address={address} />
                  ))}
                </div>
              )}
            </div>
          ),
        )}
        {pending && !searching && (
          <div className="flex justify-start">
            <span className="glass-chip inline-flex gap-1 rounded-3xl rounded-bl-lg px-4 py-3" aria-label={`${agentName} is typing`}>
              <span className="typing-dot" />
              <span className="typing-dot [animation-delay:150ms]" />
              <span className="typing-dot [animation-delay:300ms]" />
            </span>
          </div>
        )}
        {searching && (
          <div className="flex justify-start">
            <span className="glass-chip inline-flex items-center gap-2 rounded-3xl rounded-bl-lg px-4 py-3 text-sm text-ink-soft">
              <Search className="size-4 animate-pulse text-oxblood" aria-hidden />
              {agentName} is searching the web for you... this takes a minute or two
            </span>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div ref={endRef} />
      </div>

      {options.length > 0 && !busy && (
        <div className="flex flex-wrap gap-2 pb-3">
          {options.map((o, i) => (
            <button key={o} type="button" onClick={() => send(o)} className="glass-chip rounded-full px-3 py-1.5 text-sm hover:bg-white/70">
              <span className="mr-1.5 text-xs text-ink-soft">{i + 1}</span>
              {o}
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end pb-2">
        <button
          type="button"
          onClick={() => void search("")}
          disabled={busy}
          className="glass-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs hover:bg-white/70 disabled:opacity-40"
        >
          <Sparkles className="size-3.5 text-oxblood" aria-hidden /> Find me things to apply for
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="glass-input flex items-end gap-2 rounded-[28px] p-2 pl-4"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
            const n = Number(e.key);
            if (!draft && n >= 1 && n <= options.length) {
              e.preventDefault();
              send(options[n - 1]);
            }
          }}
          rows={1}
          placeholder={`Tell ${agentName} anything...`}
          aria-label={`Message ${agentName}`}
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-[15px] outline-none placeholder:text-ink-soft"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Send"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-oxblood text-paper transition hover:brightness-110 disabled:opacity-40"
        >
          <ArrowUp className="size-5" />
        </button>
      </form>
    </div>
  );
}
