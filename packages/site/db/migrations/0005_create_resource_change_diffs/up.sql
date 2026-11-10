-- data-table/transaction: none
create table resource_changes (
  resource_type text not null references resource_types (resource_type),
  ordinal integer not null,
  version text not null references versions (version),
  status text not null,
  diff text not null,
  diff_sha256 text not null,
  primary key (resource_type, ordinal),
  unique (ordinal, resource_type)
);
