-- Producer desk for the client's own show, and the actor-musician radar.
alter type source_type add value if not exists 'RADAR';
alter type source_type add value if not exists 'PRODUCER';

-- Key dates and tasks for the client's own show (registration, marketplace, grant rounds).
create table show_tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  due         date,
  details     text,
  url         text,
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (title)
);

-- Festival programmers and venue bookers who might book the show.
create type presenter_status as enum ('to_contact', 'contacted', 'replied', 'booked', 'not_now');
create table presenters (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  organisation  text,
  url           text not null,
  evidence      text,
  why           text,
  invite_draft  text,
  status        presenter_status not null default 'to_contact',
  created_at    timestamptz not null default now(),
  unique (url)
);

alter table show_tasks enable row level security;
alter table presenters enable row level security;
