-- Agent Angel can search the web for opportunities. Her finds are stored as
-- auditions under one AGENT_SEARCH source, and the result cards on the chat
-- message that announced them.
alter type source_type add value if not exists 'AGENT_SEARCH';
alter table chat_messages add column if not exists finds jsonb;
