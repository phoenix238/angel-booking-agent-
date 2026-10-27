-- Several projects (own show, schools tour, ...) in the producer area.
create table projects (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  summary            text not null default '',
  goal               text not null default '',          -- the next stop, e.g. "Edinburgh Fringe 2027"
  funding_countries  text not null default '',
  focus              text not null default '',          -- extra research guidance for this project
  buyers_label       text not null default 'Programmers to invite',
  active             boolean not null default true,     -- archived projects are hidden, never deleted
  position           int not null default 0,
  created_at         timestamptz not null default now()
);
alter table projects enable row level security;

alter table show_tasks add column project_id uuid references projects(id);
alter table presenters add column project_id uuid references projects(id);
alter table auditions  add column project_id uuid references projects(id);
create index auditions_project_idx on auditions (project_id) where project_id is not null;
create index show_tasks_project_idx on show_tasks (project_id);
create index presenters_project_idx on presenters (project_id);
