import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { Database } from 'remix/data-table';
import { type Archive, createArchive } from '#app/data/archive.ts';
import { withDatabase } from '#app/data/database.ts';
import { listSourceVersions, ordinal, requestSource } from '#app/data/specification.ts';
import { type Version, versions } from '#app/data/tables.ts';

const recheckCount = 20;
const downloadConcurrency = 8;

interface SynchronizeOptions {
  db: Database;
  archive: Archive;
  limit?: number;
  now?: Date;
}

export interface SynchronizeResult {
  archived: string[];
  unavailable: string[];
  removed: string[];
  pending: number;
}

async function archiveVersion(
  db: Database,
  archive: Archive,
  version: string,
  existing: Version | undefined,
  now: string,
) {
  const response = await requestSource(version, 'GET');
  if (!response.ok) {
    if (!existing) {
      await db.create(versions, { version, ordinal: ordinal(version), status: 'unavailable', first_seen_at: now });
    }
    return 'unavailable';
  }
  const json = new Uint8Array(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(json).digest('hex');
  const source_etag = response.headers.get('etag');
  if (existing?.sha256 === sha256) {
    await db.update(versions, version, { source_etag });
    return 'unchanged';
  }
  await archive.write(version, gzipSync(json));
  if (existing) {
    const status = existing.status === 'ready' ? 'ready' : 'pending';
    await db.update(versions, version, { status, source_etag, sha256, updated_at: now });
  } else {
    const modified = response.headers.get('last-modified');
    await db.create(versions, {
      version,
      ordinal: ordinal(version),
      status: 'pending',
      published_at: modified ? new Date(modified).toISOString() : null,
      first_seen_at: now,
      source_etag,
      sha256,
    });
  }
  return 'archived';
}

export async function synchronizeArchive({ db, archive, limit, now = new Date() }: SynchronizeOptions) {
  const timestamp = now.toISOString();
  const listed = await listSourceVersions();
  const source = limit ? listed.slice(-limit) : listed;
  const rows = new Map((await db.query(versions).all()).map((row) => [row.version, row]));
  const result: SynchronizeResult = { archived: [], unavailable: [], removed: [], pending: 0 };
  const record = (version: string, outcome: string) => {
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
      const row = rows.get(version) as Version;
      const head = await requestSource(version, 'HEAD');
      if (!head.ok || head.headers.get('etag') === row.source_etag) return;
      record(version, await archiveVersion(db, archive, version, row, timestamp));
    }),
  );

  const listedSet = new Set(listed);
  for (const row of rows.values()) {
    if (listedSet.has(row.version) || row.removed_at) continue;
    await db.update(versions, row.version, { removed_at: timestamp });
    result.removed.push(row.version);
  }
  result.pending = await db.count(versions, { where: { status: 'pending' } });
  return result;
}

export async function handler() {
  const result = await withDatabase((db) => synchronizeArchive({ db, archive: createArchive() }));
  console.log(JSON.stringify({ message: 'synchronized archive', ...result }));
  if ((result.archived.length || result.pending) && process.env.REBUILD_FUNCTION_NAME) {
    await new LambdaClient({}).send(
      new InvokeCommand({ FunctionName: process.env.REBUILD_FUNCTION_NAME, InvocationType: 'Event' }),
    );
  }
  return result;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { limit: { type: 'string' } } });
  const limit = values.limit ? Number.parseInt(values.limit, 10) : undefined;
  const result = await withDatabase((db) => synchronizeArchive({ db, archive: createArchive(), limit }));
  console.log(
    `archived ${result.archived.length}, unavailable ${result.unavailable.length}, removed ${result.removed.length}`,
  );
}
