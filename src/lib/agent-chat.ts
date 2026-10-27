import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { aboutBlock, getActiveFacts } from "./facts";
import type { Find } from "./agent-search";
import { parseStructured } from "./claude";
import { upcomingProjectDates } from "./projects";
import { recastsToWatch } from "./recast";
import { loadSettings, openingMessage, pronounWords, withCatchphrase, type Settings } from "./settings";
import { BOARD_COLUMNS, deadlineLabel, STATUS_LABEL, type Status } from "./tracker";

// Agent persona prompt, built from settings (defaults reproduce the original text).
export function chatSystemPrompt(st: Settings): string {
  const { subj, obj, poss } = pronounWords(st.client.pronouns);
  const a = st.agent;
  const first = st.client.firstName;
  return `You are ${a.name}, a warm, bubbly, sharp casting agent for ${st.client.name}, ${st.client.summary}. You are interviewing ${obj} to learn what work ${subj} wants, and helping ${obj} think through which jobs and grants to go for.

How to talk:
- ${a.tone}
- Stay genuinely useful under the fun: be specific and honest. If a job is not a fit, say so kindly and point to what would suit ${obj} better.
- Short replies: two to five sentences.
- End every reply with your catchphrase, exactly: "${a.catchphrase}"
- Ask one question at a time. Build on what ${subj} just said.
- Over the conversation, learn things like: ${a.learnTopics}
- When ${subj} asks about a specific match, give an honest view: why it fits, what might not fit, and what to prepare.
- Never invent facts about ${obj}. If unsure, ask.

What to return:
- reply: your message to ${first}.
- learned: short, standalone facts about ${first} that ${subj} has just told you and that are not already in the list you were given, written in the third person (for example "Plays violin to grade 8 standard."). Empty if nothing new.
- options: up to four short suggested answers ${subj} could tap to reply, or an empty list when a free answer is better.
- search: you can search the web for real opportunities for ${obj}. Once you know enough to search well (usually after three or four of ${poss} answers about what ${subj} wants), or whenever ${subj} asks you to look, set search to a one or two sentence brief of what to look for (e.g. "Open actor-musician auditions in London for piano players, plus bursaries for their own show at a fringe festival"), and in your reply tell ${obj} you are off to find things for ${obj}. Otherwise set search to an empty string. Do not search again straight after a search unless ${subj} asks.`;
}

const ChatSchema = z.object({
  reply: z.string(),
  learned: z.array(z.string()),
  options: z.array(z.string()),
  search: z.string(),
});

export type ChatTurn = z.infer<typeof ChatSchema>;

export type ChatMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  finds?: Find[] | null;
};

export async function getChatHistory(db: SupabaseClient, limit = 60): Promise<ChatMessageRow[]> {
  const { data, error } = await db
    .from("chat_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ChatMessageRow[]).reverse();
}

async function recentMatches(db: SupabaseClient) {
  const { data } = await db
    .from("auditions")
    .select("title, company, match_score, match_reason, url")
    .gte("match_score", 7)
    .order("date_posted", { ascending: false })
    .limit(20);
  if (!data?.length) return "No matches found yet.";
  return data
    .map((m) => `- ${m.match_score}/10: ${m.title} (${m.company ?? "company not stated"}). ${m.match_reason ?? ""}`)
    .join("\n");
}

async function trackedItems(db: SupabaseClient) {
  const { data } = await db
    .from("auditions")
    .select("title, company, status, deadline, deadline_text, notes")
    .in("status", BOARD_COLUMNS)
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(20);
  const tasks = await upcomingProjectDates(db, 60);
  const recasts = await recastsToWatch(db, 60);
  const showLines = [
    ...recasts.slice(0, 4).map((w) => `- Forecast recast (not confirmed): ${w.show}, ${w.venue}, around ${w.predicted_from} to ${w.predicted_to}`),
    ...tasks.slice(0, 8).map((t) => `- Project date (${t.parent ? `${t.parent}, plan: ${t.project}` : t.project}): ${t.title}, ${deadlineLabel(t.due)}`),
  ].join("\n");
  if (!data?.length) return showLines || "Nothing on her tracker yet.";
  return (showLines ? `${showLines}\n` : "") + data
    .map((t) => {
      const due = t.deadline ? `, ${deadlineLabel(t.deadline as string)}` : t.deadline_text ? `, deadline: ${t.deadline_text}` : "";
      return `- ${STATUS_LABEL[t.status as Status]}: ${t.title} (${t.company ?? "company not stated"})${due}${t.notes ? `. Her notes: ${t.notes}` : ""}`;
    })
    .join("\n");
}

// Saves the client's message, asks Claude for the next turn, saves the reply and any learned facts.
export async function runChatTurn(db: SupabaseClient, userText: string): Promise<ChatTurn & { learnedIds: string[] }> {
  const [history, st] = await Promise.all([getChatHistory(db, 30), loadSettings(db)]);
  if (history.length === 0) {
    const opening = openingMessage(st);
    await db.from("chat_messages").insert({ role: "assistant", content: opening });
    history.push({ id: "opening", role: "assistant", content: opening, created_at: "" });
  }
  await db.from("chat_messages").insert({ role: "user", content: userText });

  const facts = await getActiveFacts(db);
  const transcript = [...history, { role: "user" as const, content: userText }]
    .map((m) => {
      const found = "finds" in m && m.finds?.length ? `\n[Found: ${m.finds.map((f) => `${f.title} (${f.organisation})`).join("; ")}]` : "";
      return `${m.role === "user" ? st.client.firstName : "Agent"}: ${m.content}${found}`;
    })
    .join("\n\n");

  const turn = await parseStructured({
    st,
    tier: "chat",
    feature: "chat",
    maxTokens: 4000,
    effort: "medium",
    system: chatSystemPrompt(st),
    messages: [
      {
        role: "user",
        content: `${aboutBlock(facts, st)}\n\nRecent matches on her dashboard:\n${await recentMatches(db)}\n\nHer application tracker (gently nudge her about close deadlines and follow-ups when it fits):\n${await trackedItems(db)}\n\nConversation so far:\n${transcript}\n\nWrite the agent's next turn.`,
      },
    ],
    schema: ChatSchema,
  });

  // The catchphrase is part of her brand; add it if the model ever leaves it off.
  turn.reply = withCatchphrase(st, turn.reply);
  await db.from("chat_messages").insert({ role: "assistant", content: turn.reply });
  const learned = turn.learned.map((f) => f.trim()).filter(Boolean);
  let learnedIds: string[] = [];
  if (learned.length) {
    const { data } = await db
      .from("profile_facts")
      .insert(learned.map((fact) => ({ fact, source: "interview" })))
      .select("id");
    learnedIds = (data ?? []).map((r) => r.id as string);
  }
  return { ...turn, learned, options: turn.options.slice(0, 4), search: turn.search.trim(), learnedIds };
}
