import { column as c, ne, type TableRow, table } from 'remix/data-table';
import { DatabaseConnection, retryOnConflict } from './connection.ts';

export const versions = table({
  name: 'versions',
  primaryKey: 'version',
  columns: {
    version: c.text(),
    ordinal: c.integer(),
    status: c.enum(['pending', 'ready', 'unavailable'] as const),
    published_at: c.timestamp({ withTimezone: true }).nullable(),
    first_seen_at: c.timestamp({ withTimezone: true }),
    updated_at: c.timestamp({ withTimezone: true }).nullable(),
    removed_at: c.timestamp({ withTimezone: true }).nullable(),
    source_etag: c.text().nullable(),
    sha256: c.text().nullable(),
  },
});

export type Version = TableRow<typeof versions>;

export type NewVersion = Pick<Version, 'version' | 'ordinal' | 'status' | 'first_seen_at'> & Partial<Version>;

export type VersionChanges = Partial<Omit<Version, 'version'>>;

export class VersionsTable {
  static listReady() {
    return DatabaseConnection.database.query(versions).where({ status: 'ready' }).orderBy('ordinal', 'asc').all();
  }

  static listComparable() {
    return DatabaseConnection.database
      .query(versions)
      .where(ne('status', 'unavailable'))
      .orderBy('ordinal', 'asc')
      .all();
  }

  static listSynchronizationStates() {
    return DatabaseConnection.database
      .query(versions)
      .select({
        version: versions.version,
        status: versions.status,
        source_etag: versions.source_etag,
        removed_at: versions.removed_at,
      })
      .all();
  }

  static find(version: string) {
    return DatabaseConnection.database.find(versions, version);
  }

  static async create(row: NewVersion) {
    await retryOnConflict(() => DatabaseConnection.database.create(versions, row));
  }

  static async update(version: string, changes: VersionChanges) {
    await retryOnConflict(() => DatabaseConnection.database.update(versions, version, changes));
  }
}
