-- A creative project (e.g. the show) has plans under it (a festival run, a schools tour).
-- Plans are projects rows with parent_id set; dates, funding and contacts hang off a plan.
alter table projects add column parent_id uuid references projects(id);
create index projects_parent_idx on projects (parent_id) where parent_id is not null;
