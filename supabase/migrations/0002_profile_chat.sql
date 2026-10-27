-- What the agent knows about the client, and the interview chat history.

create type fact_source as enum ('website', 'interview', 'manual');

create table profile_facts (
  id          uuid primary key default gen_random_uuid(),
  fact        text        not null,
  source      fact_source not null default 'interview',
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

create table chat_messages (
  id          uuid primary key default gen_random_uuid(),
  role        text        not null check (role in ('user', 'assistant')),
  content     text        not null,
  created_at  timestamptz not null default now()
);

create index chat_messages_created_idx on chat_messages (created_at);

alter table profile_facts enable row level security;
alter table chat_messages enable row level security;
