import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { Database } from 'remix/data-table';
import { createPostgresDatabase } from 'remix/data-table/postgres';
import { type Archive, createArchive } from '#app/data/archive.ts';
import { createPool, retryOnConflict, withDatabase } from '#app/data/database.ts';
import { listSourceVersions, ordinal, requestSource } from '#app/data/specification.ts';
import { type Version, versions } from '#app/data/tables.ts';

const recheckCount = 20;
const downloadConcurrency = 8;

interface SynchronizeOptions {
  db: Database;
  archive: Archive;
  now?: Date;
}

export interface SynchronizeResult {
  archived: string[];
  unavailable: string[];
  removed: string[];
  pending: number;
}

type KnownVersion = Pick<Version, 'version' | 'status' | 'source_etag' | 'removed_at'>;

interface ArchiveResult {
  outcome: 'archived' | 'unchanged' | 'unavailable';
  status: Version['status'];
}

async function archiveVersion(
  db: Database,
  archive: Archive,
  version: string,
  known: KnownVersion | undefined,
  now: string,
): Promise<ArchiveResult> {
  const response = await requestSource(version, 'GET');
  if (!response.ok) {
    if (!known) {
      await retryOnConflict(() =>
        db.create(versions, { version, ordinal: ordinal(version), status: 'unavailable', first_seen_at: now }),
      );
    }
    return { outcome: 'unavailable', status: known?.status ?? 'unavailable' };
  }
  const json = new Uint8Array(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(json).digest('hex');
  const source_etag = response.headers.get('etag');
  const existing = known && (await db.find(versions, version));
  if (existing?.sha256 === sha256) {
    await retryOnConflict(() => db.update(versions, version, { source_etag }));
    return { outcome: 'unchanged', status: existing.status };
  }
  await archive.write(version, gzipSync(json));
  if (existing) {
    const status = existing.status === 'ready' ? 'ready' : 'pending';
    await retryOnConflict(() => db.update(versions, version, { status, source_etag, sha256, updated_at: now }));
    return { outcome: 'archived', status };
  }
  const modified = response.headers.get('last-modified');
  await retryOnConflict(() =>
    db.create(versions, {
      version,
      ordinal: ordinal(version),
      status: 'pending',
      published_at: modified ? new Date(modified).toISOString() : null,
      first_seen_at: now,
      source_etag,
      sha256,
    }),
  );
  return { outcome: 'archived', status: 'pending' };
}

export async function synchronizeArchive({ db, archive, now = new Date() }: SynchronizeOptions) {
  const timestamp = now.toISOString();
  const source = await listSourceVersions();
  const rows = new Map<string, KnownVersion>(
    (
      await db
        .query(versions)
        .select({
          version: versions.version,
          status: versions.status,
          source_etag: versions.source_etag,
          removed_at: versions.removed_at,
        })
        .all()
    ).map((row) => [row.version, row]),
  );
  const statuses = new Map([...rows.values()].map((row) => [row.version, row.status]));
  const result: SynchronizeResult = { archived: [], unavailable: [], removed: [], pending: 0 };
  const record = (version: string, { outcome, status }: ArchiveResult) => {
    statuses.set(version, status);
    if (outcome === 'archived') result.archived.push(version);
    if (outcome === 'unavailable') result.unavailable.push(version);
  };

  const missing = source.filter((version) => !rows.has(version));
  for (let index = 0; index < missing.length; index += downloadConcurrency) {
    const chunk = missing.slice(index, index + downloadConcurrency);
    const outcomes = await Promise.all(
      chunk.map((version) => archiveVersion(db, archive, version, undefined, timestamp)),
    );
    for (const [position, version] of chunk.entries()) record(version, outcomes[position]);
  }

  const recent = source.slice(-recheckCount).filter((version) => rows.has(version));
  await Promise.all(
    recent.map(async (version) => {
      const row = rows.get(version) as KnownVersion;
      const head = await requestSource(version, 'HEAD');
      if (!head.ok || head.headers.get('etag') === row.source_etag) return;
      record(version, await archiveVersion(db, archive, version, row, timestamp));
    }),
  );

  const listedSet = new Set(source);
  for (const row of rows.values()) {
    if (listedSet.has(row.version) || row.removed_at) continue;
    await retryOnConflict(() => db.update(versions, row.version, { removed_at: timestamp }));
    result.removed.push(row.version);
  }
  result.pending = [...statuses.values()].filter((status) => status === 'pending').length;
  return result;
}

let database: Database | undefined;

export async function handler() {
  database ??= createPostgresDatabase(createPool({ idleTimeoutMillis: 0 }));
  const result = await synchronizeArchive({ db: database, archive: createArchive() });
  console.log(JSON.stringify({ message: 'synchronized archive', ...result }));
  if ((result.archived.length || result.pending) && process.env.REBUILD_FUNCTION_NAME) {
    await new LambdaClient({}).send(
      new InvokeCommand({ FunctionName: process.env.REBUILD_FUNCTION_NAME, InvocationType: 'Event' }),
    );
  }
  return result;
}

if (import.meta.main) {
  const result = await withDatabase((db) => synchronizeArchive({ db, archive: createArchive() }));
  console.log(
    `archived ${result.archived.length}, unavailable ${result.unavailable.length}, removed ${result.removed.length}`,
  );
}
