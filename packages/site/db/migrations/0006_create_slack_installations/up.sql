-- data-table/transaction: none
create table slack_installations (
  team_id text primary key,
  team_name text not null,
  app_id text not null,
  bot_user_id text,
  access_token text not null,
  scope text not null,
  channel_id text,
  webhook_url text,
  installed_at timestamptz not null
);
