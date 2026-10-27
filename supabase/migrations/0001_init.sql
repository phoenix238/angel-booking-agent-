-- Audition agent: initial schema
-- Run in the Supabase SQL editor, or with `supabase db push`.

create extension if not exists "pgcrypto";

-- Enums ---------------------------------------------------------------------

create type source_type as enum ('INSTAGRAM_RSS', 'EMAIL_LIST');
create type source_status as enum ('active', 'inactive');
create type audition_category as enum ('audition', 'grant', 'other');

-- Sources -------------------------------------------------------------------
-- INSTAGRAM_RSS: value = the RSS feed URL (RSS.app or any standard RSS/Atom feed),
--                handle = the raw Instagram handle, for display.
-- EMAIL_LIST:    value = the sender address of the mailing list (used to match
--                incoming mail), inbound_address = the unique
--                address this list is subscribed with (e.g. angel+spotlight@in.example.com).

create table sources (
  id               uuid primary key default gen_random_uuid(),
  type             source_type   not null,
  value            text          not null,
  label            text,
  handle           text,
  inbound_address  text unique,
  status           source_status not null default 'active',
  last_fetched_at  timestamptz,
  created_at       timestamptz   not null default now(),
  unique (type, value)
);

-- Auditions -----------------------------------------------------------------
-- Every scored item is stored (matches and non matches) so nothing is
-- re-scored or re-billed on the next run. The dashboard shows match_score >= 7.

create table auditions (
  id                 uuid primary key default gen_random_uuid(),
  title              text        not null,
  company            text,
  description        text,
  source_id          uuid references sources(id) on delete set null,
  url                text,
  match_score        smallint    not null check (match_score between 1 and 10),
  match_reason       text,
  is_match           boolean     not null default false,
  category           audition_category not null default 'other',
  is_actor_musician  boolean     not null default false,
  external_id        text        not null,  -- RSS guid/link or email Message-ID
  raw_text           text,
  date_posted        timestamptz,
  created_at         timestamptz not null default now(),
  unique (source_id, external_id)
);

create index auditions_feed_idx on auditions (match_score desc, date_posted desc);
create index auditions_category_idx on auditions (category);
create index sources_active_idx on sources (type) where status = 'active';

-- Security ------------------------------------------------------------------
-- RLS on with no public policies: only the server (service role key) can
-- read or write. The browser never talks to these tables directly.

alter table sources   enable row level security;
alter table auditions enable row level security;
