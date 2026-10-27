-- Server-only secrets saved from the Settings page (e.g. the Instagram token).
-- RLS on with no policies: only the service role key can read or write.
create table app_secrets (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);
alter table app_secrets enable row level security;
