-- Studio Map: companies with a reason to hire the client's rare skill mix
-- (dubbing and audiobooks, performance capture and games, music and jingles).
create type studio_kind as enum ('voice', 'capture', 'music', 'other');

create table studios (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  country         text,
  kind            studio_kind not null default 'other',
  url             text not null,            -- official site
  submission_url  text,                     -- talent or contact page, if public
  what_they_buy   text,
  evidence        text,                     -- one recent project of theirs, backed by evidence_url
  evidence_url    text,
  why             text,
  fit_score       smallint check (fit_score between 1 and 10),
  pitch_draft     text,
  status          presenter_status not null default 'to_contact',
  created_at      timestamptz not null default now(),
  unique (url)
);
alter table studios enable row level security;
