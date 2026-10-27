-- What Angel did about a subscription confirmation email.
alter table emails add column confirm_status text;   -- auto_done | needs_click | null
alter table emails add column confirm_note text;
alter table emails add column confirmed_at timestamptz;
