import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { CloudFront } from '#app/aws/cloudfront.ts';
import { SQS } from '#app/aws/sqs.ts';
import { type Archive, createArchive } from '#app/data/archive.ts';
import { compare } from '#app/data/comparison.ts';
import { parseSpecification, type Specification } from '#app/data/specification.ts';
import { DatabaseConnection } from '#app/database/connection.ts';
import { type ResourceChangeOperation, ResourceChangesTable } from '#app/database/resource-changes.ts';
import { type ResourceType, ResourceTypesTable } from '#app/database/resource-types.ts';
import { VersionsTable } from '#app/database/versions.ts';
import { Logger } from '#app/logger.ts';

interface RebuildOptions {
  archive: Archive;
}

async function planTypes(latest: Map<string, ResourceType>) {
  const stored = new Map((await ResourceTypesTable.list()).map((row) => [row.resource_type, row]));
  const upserts: ResourceType[] = [];
  for (const row of latest.values()) {
    const existing = stored.get(row.resource_type);
    stored.delete(row.resource_type);
    if (existing?.latest_version === row.latest_version && existing.latest_status === row.latest_status) continue;
    upserts.push(row);
  }
  return { upserts, removals: [...stored.keys()] };
}

export async function rebuildChanges({ archive }: RebuildOptions) {
  const comparable = await VersionsTable.listComparable();
  const stored = new Map(
    (await ResourceChangesTable.listDigests()).map((row) => [`${row.ordinal}|${row.resource_type}`, row]),
  );
  const operations: ResourceChangeOperation[] = [];
  const changed = new Set<string>();
  const latest = new Map<string, ResourceType>();
  let previous: Specification | undefined;
  for (const version of comparable) {
    const current = parseSpecification(gunzipSync(await archive.read(version.version)));
    for (const diff of compare(previous, current)) {
      latest.set(diff.name, {
        resource_type: diff.name,
        latest_version: version.version,
        latest_status: diff.status,
      });
      const json = JSON.stringify(diff);
      const diff_sha256 = createHash('sha256').update(json).digest('hex');
      const key = `${version.ordinal}|${diff.name}`;
      const existing = stored.get(key);
      stored.delete(key);
      if (existing?.diff_sha256 === diff_sha256) continue;
      operations.push({
        row: {
          resource_type: diff.name,
          ordinal: version.ordinal,
          version: version.version,
          status: diff.status,
          diff: json,
          diff_sha256,
        },
      });
      changed.add(version.version);
    }
    previous = current;
  }
  for (const row of stored.values()) {
    operations.push({ key: { resource_type: row.resource_type, ordinal: row.ordinal } });
    changed.add(row.version);
  }
  const { upserts, removals } = await planTypes(latest);
  await ResourceTypesTable.apply(upserts, []);
  await ResourceChangesTable.apply(operations);
  const ready = comparable.filter((row) => row.status === 'pending');
  for (const version of ready) {
    await VersionsTable.update(version.version, { status: 'ready' });
    changed.add(version.version);
  }
  await ResourceTypesTable.apply([], removals);
  const newest = comparable.at(-1);
  return {
    changed: [...changed],
    latestReady: newest && ready.includes(newest) ? { version: newest.version, ordinal: newest.ordinal } : undefined,
    typesWritten: upserts.length + removals.length,
  };
}

export async function handler(lambdaEvent: unknown) {
  Logger.info('lambda event received', { lambdaEvent });
  const { changed, latestReady, typesWritten } = await rebuildChanges({ archive: createArchive() });
  Logger.info('rebuilt changes', { changed, latestReady, typesWritten });
  if (latestReady) await SQS.sendMessage('versionReady', latestReady);
  if (changed.length || typesWritten) await CloudFront.invalidate(['/*']);
  return { changed };
}

if (import.meta.main) {
  const { changed } = await rebuildChanges({ archive: createArchive() });
  await DatabaseConnection.close();
  console.log(`changed ${changed.length} versions`);
}
