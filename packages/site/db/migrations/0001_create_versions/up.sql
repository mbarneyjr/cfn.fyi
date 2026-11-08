-- data-table/transaction: none
create table versions (
  version text primary key,
  ordinal integer not null unique,
  status text not null,
  published_at timestamptz,
  first_seen_at timestamptz not null,
  updated_at timestamptz,
  removed_at timestamptz,
  source_etag text,
  sha256 text
);
