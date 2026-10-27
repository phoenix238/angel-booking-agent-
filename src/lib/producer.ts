import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { aboutBlock, getActiveFacts } from "./facts";
import { ingestItem } from "./ingest";
import { parseStructured, webResearch as research } from "./claude";
import { getProject } from "./projects";
import { loadSettings, withCatchphrase, type Settings } from "./settings";

// The producer desk for one project (own show, schools tour, ...): key dates,
// funding, and the people who could book or commission it. Nothing is sent or
// submitted; it drafts and reminds.

const webResearch = (st: Settings, prompt: string, maxUses?: number) => research(st, prompt, maxUses, "producer");

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const ProducerSchema = z.object({
  message: z.string(),
  dates: z.array(z.object({ title: z.string(), date_iso: z.string(), details: z.string(), url: z.string() })),
  funding: z.array(
    z.object({
      title: z.string(),
      organisation: z.string(),
      url: z.string(),
      deadline_text: z.string(),
      deadline_iso: z.string(),
      details: z.string(),
      why: z.string(),
    }),
  ),
  presenters: z.array(
    z.object({ name: z.string(), organisation: z.string(), url: z.string(), evidence: z.string(), why: z.string(), invite_draft: z.string() }),
  ),
});

export type ProducerResult = { message: string; dates: number; funding: number; presenters: number };

async function producerSourceId(db: SupabaseClient): Promise<string> {
  const { data } = await db.from("sources").select("id").eq("type", "PRODUCER").maybeSingle();
  if (data) return data.id as string;
  const { data: created, error } = await db
    .from("sources")
    .insert({ type: "PRODUCER", value: "show-producer", label: "Producer" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

export async function runProducer(db: SupabaseClient, projectId: string, focus = ""): Promise<ProducerResult> {
  const project = await getProject(db, projectId);
  if (!project || !project.active) throw new Error("That plan could not be found.");
  // A plan sits under a creative project; the research should know which one.
  const parent = project.parent_id ? await getProject(db, project.parent_id) : null;
  const [st, facts, sourceId, { data: knownPresenters }, { data: existingTasks }] = await Promise.all([
    loadSettings(db),
    getActiveFacts(db),
    producerSourceId(db),
    db.from("presenters").select("name, organisation").eq("project_id", project.id).limit(60),
    db.from("show_tasks").select("due, url").eq("project_id", project.id),
  ]);
  const first = st.client.firstName;
  const today = new Date().toISOString().slice(0, 10);
  const buyers = project.buyers_label.toLowerCase();

  const about = aboutBlock(facts, st);
  const intro =
    `${about}\n\nToday is ${today}. You are the producer for ${first}.` +
    `${parent ? ` Her creative project is "${parent.name}": ${parent.summary}\nThe plan you are working on is "${project.name}": ${project.summary}` : ` Project: "${project.name}". ${project.summary}`}` +
    `${project.goal ? `\nNext stop: ${project.goal}.` : ""}${project.focus ? `\nGuidance for this project: ${project.focus}` : ""}` +
    `${focus ? `\nFocus this time: ${focus}` : ""}`;
  const linkRule = "Give the exact official URL for every item; leave out anything you cannot link to. Skip anything already closed.";

  // Three focused searches in parallel, so no one topic uses up the others' search budget.
  const [datesNotes, fundingNotes, presenterNotes] = await Promise.all([
    webResearch(
      st,
      `${intro}\n\nFind the KEY DATES that matter to ${first} for this project${project.goal ? ` and its next stop (${project.goal})` : ""}: registration, application and call deadlines, marketplace or showcase sign ups, programme launches, event or festival dates, and any checks or paperwork that must be in place first. Say exactly what each date is for. ${linkRule}`,
      6,
    ),
    webResearch(
      st,
      `${intro}\n\nFind FUNDING for this project${project.funding_countries ? ` from ${project.funding_countries}` : ""}: travel and touring grants, project grants, artist development funds, festival and scheme funds. Only ones open now or opening in the next six months. For each: the exact deadline or round date, who can apply, roughly how much, and the official page. ${linkRule}`,
      8,
    ),
    webResearch(
      st,
      `${intro}\n\nFind 6 to 10 of the ${buyers}: the people and organisations who could book, programme or commission this project. For each: the organisation, a public page showing the evidence (a past programme or past bookings), why it fits, and how artists are invited to approach them (an open call or published contact page). No personal contact details. Spend your searches on finding them, not on dates or funding.${knownPresenters?.length ? ` Already on the shortlist, do not repeat: ${knownPresenters.map((p) => `${p.name} (${p.organisation ?? ""})`).join("; ")}.` : ""} ${linkRule}`,
      12,
    ),
  ]);
  const writeUp = `KEY DATES NOTES:\n${datesNotes}\n\nFUNDING NOTES:\n${fundingNotes}\n\nNOTES ON ${buyers.toUpperCase()}:\n${presenterNotes}`;

  const parsedOut = await parseStructured({
    st,
    tier: "light",
    feature: "producer",
    maxTokens: 12000,
    system: `You are ${st.agent.name}, ${first}'s ${st.agent.voice}, acting as producer for ${parent ? `"${parent.name}" (plan: ${project.name})` : `"${project.name}"`}. Turn the research notes into structured data. Include every ${buyers} item described that has a link (use their programme, bookings or open call page as url), every funding item from FUNDING NOTES, and every date from KEY DATES NOTES. Copy URLs exactly and never invent one; drop anything without a URL. date_iso and deadline_iso are YYYY-MM-DD only for a real date, otherwise an empty string. For each person or organisation write invite_draft: a short, warm, personal email ${first} could adapt and send ${st.client.pronouns === "he" ? "himself" : st.client.pronouns === "they" ? "themself" : "herself"} (no more than 120 words, mentions why their work fits, and asks how to be considered or invites them; British spelling). Also write message: two to four excited sentences to ${first} summarising what you found, leading with the most urgent date. Do not promise to research more later; if something is missing, suggest running the producer again with a focus. End the message with exactly: "${st.agent.catchphrase}"`,
    messages: [{ role: "user", content: writeUp }],
    schema: ProducerSchema,
  });
  const r = parsedOut;

  // Only dates still to come (or undated) are useful. Dedupe within this project only.
  const dates = r.dates.filter((d) => d.title.trim() && (!ISO.test(d.date_iso) || d.date_iso >= today));
  const knownDays = new Set((existingTasks ?? []).map((t) => t.due as string | null).filter(Boolean));
  const knownUrls = new Set((existingTasks ?? []).map((t) => t.url as string | null).filter(Boolean));
  const newDates = dates.filter((d) => (ISO.test(d.date_iso) ? !knownDays.has(d.date_iso) : !knownUrls.has(d.url)));
  if (newDates.length) {
    await db.from("show_tasks").upsert(
      newDates.map((d) => ({
        project_id: project.id,
        title: d.title.slice(0, 200),
        due: ISO.test(d.date_iso) ? d.date_iso : null,
        details: d.details || null,
        url: /^https?:\/\//.test(d.url) ? d.url : null,
      })),
      { onConflict: "project_id,title" },
    );
  }

  const ctx = { prompt: st.scoringPrompt, about, st };
  let fundingSaved = 0;
  for (const f of r.funding.filter((f) => /^https?:\/\//.test(f.url))) {
    try {
      await ingestItem(
        db,
        {
          sourceId,
          // Prefixed with the project so the same grant can be tracked for two projects.
          externalId: `${project.id}|${f.url}`,
          text: [f.title, `Organisation: ${f.organisation}`, `Deadline: ${f.deadline_text}`, `For the plan "${project.name}"`, f.details].join("\n"),
          url: f.url,
          fallbackTitle: f.title,
          deadline: ISO.test(f.deadline_iso) ? f.deadline_iso : null,
          deadlineText: f.deadline_text,
          projectId: project.id,
        },
        ctx,
      );
      fundingSaved++;
    } catch (e) {
      console.error("[producer] funding failed:", f.url, e instanceof Error ? e.message : e);
    }
  }

  const presenters = r.presenters.filter((p) => /^https?:\/\//.test(p.url) && p.name.trim());
  if (presenters.length) {
    await db.from("presenters").upsert(
      presenters.map((p) => ({
        project_id: project.id,
        name: p.name,
        organisation: p.organisation || null,
        url: p.url,
        evidence: p.evidence || null,
        why: p.why || null,
        invite_draft: p.invite_draft || null,
      })),
      { onConflict: "project_id,url", ignoreDuplicates: true },
    );
  }

  return { message: withCatchphrase(st, r.message), dates: dates.length, funding: fundingSaved, presenters: presenters.length };
}
