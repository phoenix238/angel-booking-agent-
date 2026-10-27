-- One row of client and agent settings, edited on the Settings page.
create table app_settings (
  id          int primary key default 1 check (id = 1),
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table app_settings enable row level security;
insert into app_settings (id) values (1);
