-- Emails Angel has read, newsletters split into opportunities, and suggested lists to join.
create table emails (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid references sources(id) on delete set null,
  message_id       text not null,
  subject          text,
  from_name        text,
  from_addr        text,
  received_at      timestamptz not null default now(),
  kind             text not null default 'newsletter',   -- newsletter | confirm | other
  summary          text,
  item_count       int not null default 0,
  match_count      int not null default 0,
  confirm_url      text,
  unsubscribe_url  text,
  handled          boolean not null default false,        -- a confirmation that is done or dismissed
  created_at       timestamptz not null default now(),
  unique (source_id, message_id)
);
create index emails_received_idx on emails (received_at desc);
alter table emails enable row level security;

create table list_suggestions (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  organisation   text,
  kind           text not null default 'casting',        -- casting | funding | venue | other
  what_it_sends  text,
  why            text,
  signup_url     text not null unique,
  cost           text not null default 'free',           -- free | paid | unknown
  status         text not null default 'suggested',      -- suggested | joined | dismissed
  source_id      uuid references sources(id) on delete set null,
  created_at     timestamptz not null default now()
);
alter table list_suggestions enable row level security;

-- Items extracted from a newsletter point back to it; dedupe_key stops the same casting
-- arriving from several lists being scored and shown twice.
alter table auditions add column email_id uuid references emails(id);
alter table auditions add column dedupe_key text;
create index auditions_dedupe_idx on auditions (dedupe_key, created_at) where dedupe_key is not null;
