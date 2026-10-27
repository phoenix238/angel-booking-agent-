-- Recast Clock: shows, tours and cruise casts that recast on a cycle.
-- history holds dated cast-change announcements found by research; the next
-- window is worked out in code from those dates, never invented by the model.
create table watched_shows (
  id               uuid primary key default gen_random_uuid(),
  show             text not null,
  venue            text not null,
  kind             text not null default 'other',
  url              text,
  contract_months  int,
  history          jsonb not null default '[]'::jsonb,   -- [{date, note, url}]
  predicted_from   date,
  predicted_to     date,
  confidence       text,                                  -- low | medium | high
  basis            text,
  fit_note         text,
  last_checked     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (show, venue)
);
alter table watched_shows enable row level security;
