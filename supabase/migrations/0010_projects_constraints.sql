-- Run after every show_tasks / presenters row has a project (see the one-off backfill).
-- Postgres treats NULLs as distinct, so project_id must be NOT NULL for the composite keys to bite.
alter table show_tasks alter column project_id set not null;
alter table presenters alter column project_id set not null;

alter table show_tasks drop constraint if exists show_tasks_title_key;
alter table presenters drop constraint if exists presenters_url_key;
alter table show_tasks add constraint show_tasks_project_title_key unique (project_id, title);
alter table presenters add constraint presenters_project_url_key unique (project_id, url);
