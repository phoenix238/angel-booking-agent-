-- Spend meter: one row per Claude API call, with its cost worked out in code.
create table usage_log (
  id            uuid primary key default gen_random_uuid(),
  at            timestamptz not null default now(),
  feature       text not null,            -- scoring, chat, search, producer, radar, studios, recast
  model         text not null,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cache_read    int not null default 0,
  cache_write   int not null default 0,
  searches      int not null default 0,
  cost_usd      numeric(10,5) not null default 0
);
create index usage_log_at_idx on usage_log (at);
alter table usage_log enable row level security;

-- Routine jobs (feed check, radar, recast watch): when each last ran or was put off.
create table job_runs (
  id       uuid primary key default gen_random_uuid(),
  job      text not null,                 -- feeds, radar, recast
  ran_at   timestamptz not null default now(),
  trigger  text not null default 'manual', -- manual | cron | snooze
  result   text
);
create index job_runs_job_idx on job_runs (job, ran_at desc);
alter table job_runs enable row level security;
