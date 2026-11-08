-- data-table/transaction: none
create table resource_types (
  resource_type text primary key,
  latest_version text not null references versions (version),
  latest_status text not null
);
