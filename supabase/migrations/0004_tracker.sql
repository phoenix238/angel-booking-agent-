-- Application tracker: every audition can move through these stages.
create type application_status as enum (
  'to_look_at', 'want_to_apply', 'applied', 'audition_booked', 'recall', 'offer', 'not_this_time', 'not_for_me'
);

alter table auditions
  add column status application_status not null default 'to_look_at',
  add column status_changed_at timestamptz,
  add column deadline date,
  add column deadline_text text,
  add column notes text;

create index auditions_status_idx on auditions (status);
create index auditions_deadline_idx on auditions (deadline) where deadline is not null;

-- One row per digest run; "new since the last digest" reads from here.
create table digest_runs (
  id          uuid primary key default gen_random_uuid(),
  sent_at     timestamptz not null default now(),
  recipients  text,
  item_count  int not null default 0,
  sent        boolean not null default false,
  error       text
);
alter table digest_runs enable row level security;
