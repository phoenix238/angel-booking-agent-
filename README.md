# Agent Angel: an audition and grant finder

An open source app that finds castings, auditions and grants for a performer, scores each one
against their profile with Claude, and shows the best matches. Built for one client per copy of
the app (you run your own copy, with your own database and API key).

It reads three kinds of source: RSS feeds, Instagram (official Graph API), and mailing lists
(Angel has her own inbox, joins newsletters, confirms the sign-ups, and pulls the opportunities
out of each email). It also has a chat with "Agent Angel" who interviews the client, searches the
web for opportunities, and remembers what she learns.

Stack: Next.js 16 (App Router), TypeScript, Tailwind v4, Supabase (Postgres, magic link login),
Anthropic API (`@anthropic-ai/sdk`), Vercel for hosting and cron.

## What you need

- A Supabase project (free tier is fine)
- An Anthropic API key (console.anthropic.com). Scoring uses Haiku and costs a fraction of a
  cent per notice. Web research runs cost about 60 cents to 1 dollar each. The Costs panel in
  Settings shows spend and lets you set an optional monthly limit.
- A Vercel account for hosting (or run it locally with `npm run dev`)
- An inbox for newsletters (optional): any IMAP mailbox with an app password, or Cloudflare
  Email Routing on a domain you own (see `email-worker/`).

## Quick start

```bash
git clone <this repo> && cd <this repo>
npm install
cp .env.example .env.local     # fill it in; never commit this file
npx supabase link --project-ref <your-ref>
npx supabase db push           # runs every file in supabase/migrations
npm run dev                    # http://localhost:3000
```

Log in with an address listed in `ALLOWED_EMAILS` (magic link), then open `/onboarding`. Angel
asks who the client is and where they can work, and drafts the profile from a website link.
Everything client specific lives in the `app_settings` table and the Settings page, so nothing
is hard coded to one person. The default scoring prompt is generic; edit it under Settings.

## Deploy

```bash
npm i -g vercel && vercel link
# add each variable from .env.example:  vercel env add NAME production
vercel deploy --prod
```

Cron jobs are in `vercel.json`. Routine jobs ask for your OK by default ("request mode"); switch a
job to automatic in Settings, Routine jobs.

## Where things live

| Piece | Where |
| --- | --- |
| Schema | `supabase/migrations` |
| Scoring prompt and model calls | `src/lib/llm.ts`, `src/lib/claude.ts` |
| Settings and defaults | `src/lib/settings.ts` |
| Ingest, dedupe, keyword prefilter | `src/lib/ingest.ts`, `src/lib/prefilter.ts` |
| Newsletters and inbox reading | `src/lib/newsletter.ts`, `email-ingest.ts`, `confirm.ts`, `mailbox.ts` |
| Agent chat and web search | `src/lib/agent-chat.ts`, `agent-search.ts` |
| Emails tab (lists, Join, digest) | `src/app/emails` |
| Producer area (shows, tours, funding) | `src/app/show`, `src/lib/producer.ts` |
| Login allow list | `src/proxy.ts`, `ALLOWED_EMAILS` |

## Safety notes

- The app uses the Supabase service role key on the server only. Row level security is on; keep it on.
- Auto-confirming newsletter sign-ups only follows secure links on the sender's own site or a known
  mailing service, and never anything that looks like unsubscribing. You can switch it off in Emails.
- Use a dedicated mailbox for newsletters, never your everyday inbox.
- Do not commit `.env.local`. If a key leaks, rotate it.

## Customise

Change the colours in `src/app/globals.css`, the persona in Settings, Agent, and the places the
client can work in Settings, Regions. Pull requests welcome.

Licence: MIT.
