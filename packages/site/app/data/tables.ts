import { column as c, type TableRow, table } from 'remix/data-table';

export const versions = table({
  name: 'versions',
  primaryKey: 'version',
  columns: {
    version: c.text(),
    ordinal: c.integer(),
    status: c.enum(['pending', 'ready', 'unavailable']),
    published_at: c.timestamp({ withTimezone: true }).nullable(),
    first_seen_at: c.timestamp({ withTimezone: true }),
    updated_at: c.timestamp({ withTimezone: true }).nullable(),
    removed_at: c.timestamp({ withTimezone: true }).nullable(),
    source_etag: c.text().nullable(),
    sha256: c.text().nullable(),
  },
});

export const resourceChanges = table({
  name: 'resource_changes',
  primaryKey: ['resource_type', 'ordinal'],
  columns: {
    resource_type: c.text(),
    ordinal: c.integer(),
    version: c.text(),
    status: c.enum(['added', 'modified', 'removed']),
    block: c.text(),
    block_sha256: c.text(),
  },
});

export type Version = TableRow<typeof versions>;
export type ResourceChange = TableRow<typeof resourceChanges>;
