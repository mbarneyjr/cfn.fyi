import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import type { Database } from 'remix/data-table';
import { type Archive, createArchive } from '#app/data/archive.ts';
import { compare } from '#app/data/comparison.ts';
import { retryOnConflict, withDatabase } from '#app/data/database.ts';
import { parseSpecification, type Specification } from '#app/data/specification.ts';
import {
  type ResourceChange,
  type ResourceType,
  resourceChanges,
  resourceTypes,
  type Version,
  versions,
} from '#app/data/tables.ts';

const batchRows = 2000;
const batchBytes = 8 * 1024 * 1024;

type Operation = { row: ResourceChange } | { key: { resource_type: string; ordinal: number } };

interface RebuildOptions {
  db: Database;
  archive: Archive;
}

const writeBatch = (db: Database, batch: Operation[]) =>
  retryOnConflict(() =>
    db.transaction(async (transaction) => {
      for (const operation of batch) {
        if ('row' in operation) {
          await transaction
            .query(resourceChanges)
            .upsert(operation.row, { conflictTarget: ['resource_type', 'ordinal'] });
        } else {
          await transaction.delete(resourceChanges, operation.key);
        }
      }
    }),
  );

async function write(db: Database, operations: Operation[]) {
  let batch: Operation[] = [];
  let bytes = 0;
  for (const operation of operations) {
    const size = 'row' in operation ? operation.row.block.length : 0;
    if (batch.length === batchRows || (batch.length && bytes + size > batchBytes)) {
      await writeBatch(db, batch);
      batch = [];
      bytes = 0;
    }
    batch.push(operation);
    bytes += size;
  }
  if (batch.length) await writeBatch(db, batch);
}

async function writeTypes(db: Database, upserts: ResourceType[], removals: string[]) {
  const operations = [...upserts.map((row) => ({ row })), ...removals.map((resource_type) => ({ resource_type }))];
  for (let index = 0; index < operations.length; index += batchRows) {
    const batch = operations.slice(index, index + batchRows);
    await retryOnConflict(() =>
      db.transaction(async (transaction) => {
        for (const operation of batch) {
          if ('row' in operation) {
            await transaction.query(resourceTypes).upsert(operation.row, { conflictTarget: ['resource_type'] });
          } else {
            await transaction.delete(resourceTypes, operation.resource_type);
          }
        }
      }),
    );
  }
}

async function planTypes(db: Database, latest: Map<string, ResourceType>) {
  const stored = new Map((await db.query(resourceTypes).all()).map((row) => [row.resource_type, row]));
  const upserts: ResourceType[] = [];
  for (const row of latest.values()) {
    const existing = stored.get(row.resource_type);
    stored.delete(row.resource_type);
    if (existing?.latest_version === row.latest_version && existing.latest_status === row.latest_status) continue;
    upserts.push(row);
  }
  return { upserts, removals: [...stored.keys()] };
}

export async function rebuildChanges({ db, archive }: RebuildOptions) {
  const comparable = (await db.query(versions).orderBy('ordinal', 'asc').all()).filter(
    (version) => version.status !== 'unavailable',
  );
  const stored = new Map(
    (
      await db
        .query(resourceChanges)
        .select({
          resource_type: resourceChanges.resource_type,
          ordinal: resourceChanges.ordinal,
          version: resourceChanges.version,
          block_sha256: resourceChanges.block_sha256,
        })
        .all()
    ).map((row) => [`${row.ordinal}|${row.resource_type}`, row]),
  );
  const operations: Operation[] = [];
  const changed = new Set<string>();
  const latest = new Map<string, ResourceType>();
  let previous: Specification | undefined;
  for (const version of comparable) {
    const current = parseSpecification(gunzipSync(await archive.read(version.version)));
    for (const block of compare(previous, current).blocks) {
      latest.set(block.name, {
        resource_type: block.name,
        latest_version: version.version,
        latest_status: block.status,
      });
      const json = JSON.stringify(block);
      const block_sha256 = createHash('sha256').update(json).digest('hex');
      const key = `${version.ordinal}|${block.name}`;
      const existing = stored.get(key);
      stored.delete(key);
      if (existing?.block_sha256 === block_sha256) continue;
      operations.push({
        row: {
          resource_type: block.name,
          ordinal: version.ordinal,
          version: version.version,
          status: block.status,
          block: json,
          block_sha256,
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
  const { upserts, removals } = await planTypes(db, latest);
  await writeTypes(db, upserts, []);
  await write(db, operations);
  for (const version of comparable.filter((row) => row.status === 'pending')) {
    await retryOnConflict(() => db.update(versions, version.version, { status: 'ready' }));
    changed.add(version.version);
  }
  await writeTypes(db, [], removals);
  return { changed: [...changed], comparable, typesWritten: upserts.length + removals.length };
}

export function invalidationPaths(comparable: Version[], changed: string[]) {
  const paths = new Set(['/', '/sitemap.xml', '/resources*']);
  const order = comparable.map((version) => version.version);
  for (const version of changed) {
    const index = order.indexOf(version);
    for (const neighbor of [order[index - 1], version, order[index + 1]]) {
      if (neighbor) paths.add(`/version/${neighbor}`);
    }
  }
  return [...paths];
}

export async function handler() {
  const { changed, comparable, typesWritten } = await withDatabase((db) =>
    rebuildChanges({ db, archive: createArchive() }),
  );
  console.log(JSON.stringify({ message: 'rebuilt changes', changed, typesWritten }));
  if ((changed.length || typesWritten) && process.env.DISTRIBUTION_ID) {
    const items = invalidationPaths(comparable, changed);
    await new CloudFrontClient({}).send(
      new CreateInvalidationCommand({
        DistributionId: process.env.DISTRIBUTION_ID,
        InvalidationBatch: {
          CallerReference: `rebuild-${Date.now()}`,
          Paths: { Quantity: items.length, Items: items },
        },
      }),
    );
  }
  return { changed };
}

if (import.meta.main) {
  const { changed } = await withDatabase((db) => rebuildChanges({ db, archive: createArchive() }));
  console.log(`changed ${changed.length} versions`);
}
