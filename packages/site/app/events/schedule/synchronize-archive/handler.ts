import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { Lambda } from '#app/aws/lambda.ts';
import { type Archive, createArchive } from '#app/data/archive.ts';
import { listSourceVersions, ordinal, requestSource } from '#app/data/specification.ts';
import { DatabaseConnection } from '#app/database/connection.ts';
import { type Version, VersionsTable } from '#app/database/versions.ts';

const recheckCount = 20;
const downloadConcurrency = 8;

interface SynchronizeOptions {
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
  archive: Archive,
  version: string,
  known: KnownVersion | undefined,
  now: string,
): Promise<ArchiveResult> {
  const response = await requestSource(version, 'GET');
  if (!response.ok) {
    if (!known) {
      await VersionsTable.create({ version, ordinal: ordinal(version), status: 'unavailable', first_seen_at: now });
    }
    return { outcome: 'unavailable', status: known?.status ?? 'unavailable' };
  }
  const json = new Uint8Array(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(json).digest('hex');
  const source_etag = response.headers.get('etag');
  const existing = known && (await VersionsTable.find(version));
  if (existing?.sha256 === sha256) {
    await VersionsTable.update(version, { source_etag });
    return { outcome: 'unchanged', status: existing.status };
  }
  await archive.write(version, gzipSync(json));
  if (existing) {
    const status = existing.status === 'ready' ? 'ready' : 'pending';
    await VersionsTable.update(version, { status, source_etag, sha256, updated_at: now });
    return { outcome: 'archived', status };
  }
  const modified = response.headers.get('last-modified');
  await VersionsTable.create({
    version,
    ordinal: ordinal(version),
    status: 'pending',
    published_at: modified ? new Date(modified).toISOString() : null,
    first_seen_at: now,
    source_etag,
    sha256,
  });
  return { outcome: 'archived', status: 'pending' };
}

export async function synchronizeArchive({ archive, now = new Date() }: SynchronizeOptions) {
  const timestamp = now.toISOString();
  const source = await listSourceVersions();
  const rows = new Map<string, KnownVersion>(
    (await VersionsTable.listSynchronizationStates()).map((row) => [row.version, row]),
  );
  const statuses = new Map([...rows.values()].map((row) => [row.version, row.status]));
  const result: SynchronizeResult = { archived: [], unavailable: [], removed: [], pending: 0 };
  const missing = source.filter((version) => !rows.has(version));
  for (let index = 0; index < missing.length; index += downloadConcurrency) {
    const chunk = missing.slice(index, index + downloadConcurrency);
    const outcomes = await Promise.all(chunk.map((version) => archiveVersion(archive, version, undefined, timestamp)));
    for (const [position, version] of chunk.entries()) {
      const { outcome, status } = outcomes[position];
      statuses.set(version, status);
      if (outcome === 'archived') result.archived.push(version);
      if (outcome === 'unavailable') result.unavailable.push(version);
    }
  }

  const recent = source.slice(-recheckCount).filter((version) => rows.has(version));
  await Promise.all(
    recent.map(async (version) => {
      const row = rows.get(version) as KnownVersion;
      const head = await requestSource(version, 'HEAD');
      if (!head.ok || head.headers.get('etag') === row.source_etag) return;
      const { outcome, status } = await archiveVersion(archive, version, row, timestamp);
      statuses.set(version, status);
      if (outcome === 'archived') result.archived.push(version);
      if (outcome === 'unavailable') result.unavailable.push(version);
    }),
  );

  const listedSet = new Set(source);
  for (const row of rows.values()) {
    if (listedSet.has(row.version) || row.removed_at) continue;
    await VersionsTable.update(row.version, { removed_at: timestamp });
    result.removed.push(row.version);
  }
  result.pending = [...statuses.values()].filter((status) => status === 'pending').length;
  return result;
}

export async function handler() {
  const result = await synchronizeArchive({ archive: createArchive() });
  console.log(JSON.stringify({ message: 'synchronized archive', ...result }));
  if (result.archived.length || result.pending) await Lambda.invokeAsynchronously('rebuildChanges');
  return result;
}

if (import.meta.main) {
  const result = await synchronizeArchive({ archive: createArchive() });
  await DatabaseConnection.close();
  console.log(
    `archived ${result.archived.length}, unavailable ${result.unavailable.length}, removed ${result.removed.length}`,
  );
}
