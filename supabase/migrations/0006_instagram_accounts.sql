-- Instagram accounts read directly through the Instagram Graph API
-- (Business Discovery). value = the account's username, without @.
alter type source_type add value if not exists 'INSTAGRAM_ACCOUNT';
