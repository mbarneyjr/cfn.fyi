-- data-table/transaction: none
create table email_subscribers (
  email text primary key,
  token text not null unique,
  status text not null,
  requested_at timestamptz not null,
  confirmed_at timestamptz,
  notified_ordinal integer
);
