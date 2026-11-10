import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { DirectoryArchive } from '#app/data/archive.ts';
import type { Specification } from '#app/data/specification.ts';
import { resourceChanges, resourceTypes, versions } from '#app/data/tables.ts';
import { createTestDatabase } from '../../db/test-database.ts';
import { invalidationPaths, rebuildChanges } from './rebuild-changes.ts';

const specification = (version: string, resources: string[]): Specification => ({
  ResourceSpecificationVersion: version,
  ResourceTypes: Object.fromEntries(
    resources.map((name) => [name, { Properties: { Name: { PrimitiveType: 'String' } } }]),
  ),
  PropertyTypes: {},
});

async function setup(t: { after(callback: () => unknown): void }) {
  const db = await createTestDatabase();
  const directory = await mkdtemp(join(tmpdir(), 'cfnfyi-archive-'));
  t.after(async () => {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });
  const archive = new DirectoryArchive(directory);
  const store = (value: Specification) =>
    archive.write(value.ResourceSpecificationVersion, gzipSync(JSON.stringify(value)));
  const seen = '2026-01-01T00:00:00.000Z';
  await db.createMany(versions, [
    { version: '1.0.0', ordinal: 1000000, status: 'ready', first_seen_at: seen },
    { version: '2.0.0', ordinal: 2000000, status: 'unavailable', first_seen_at: seen },
    { version: '3.0.0', ordinal: 3000000, status: 'pending', first_seen_at: seen },
  ]);
  await store(specification('1.0.0', ['AWS::Test::Kept', 'AWS::Test::Gone']));
  await store(specification('3.0.0', ['AWS::Test::Kept', 'AWS::Test::New']));
  return { db, archive, store };
}

describe('rebuildChanges', () => {
  it('compares each archived version with the previous archived version', async (t) => {
    const { db, archive } = await setup(t);
    const { changed } = await rebuildChanges({ db, archive });
    assert.deepEqual(changed, ['1.0.0', '3.0.0']);
    assert.equal((await db.find(versions, '3.0.0'))?.status, 'ready');
    assert.equal((await db.find(versions, '2.0.0'))?.status, 'unavailable');
    const rows = await db.query(resourceChanges).where({ ordinal: 3000000 }).orderBy('resource_type', 'asc').all();
    assert.deepEqual(
      rows.map((row) => [row.resource_type, row.status]),
      [
        ['AWS::Test::Gone', 'removed'],
        ['AWS::Test::New', 'added'],
      ],
    );
    assert.equal(JSON.parse(rows[1].diff).name, 'AWS::Test::New');
    const types = await db.query(resourceTypes).orderBy('resource_type', 'asc').all();
    assert.deepEqual(
      types.map((row) => [row.resource_type, row.latest_version, row.latest_status]),
      [
        ['AWS::Test::Gone', '3.0.0', 'removed'],
        ['AWS::Test::Kept', '1.0.0', 'added'],
        ['AWS::Test::New', '3.0.0', 'added'],
      ],
    );
  });

  it('reports a type write when the changes are unchanged', async (t) => {
    const { db, archive } = await setup(t);
    await rebuildChanges({ db, archive });
    await db.update(resourceTypes, 'AWS::Test::Kept', { latest_status: 'modified' });
    const { changed, typesWritten } = await rebuildChanges({ db, archive });
    assert.deepEqual(changed, []);
    assert.equal(typesWritten, 1);
  });

  it('writes nothing when the archive is unchanged', async (t) => {
    const { db, archive } = await setup(t);
    await rebuildChanges({ db, archive });
    const { changed } = await rebuildChanges({ db, archive });
    assert.deepEqual(changed, []);
  });

  it('replaces and deletes rows after an archived version changes', async (t) => {
    const { db, archive, store } = await setup(t);
    await rebuildChanges({ db, archive });
    await store(specification('3.0.0', ['AWS::Test::Kept', 'AWS::Test::Gone']));
    const { changed } = await rebuildChanges({ db, archive });
    assert.deepEqual(changed, ['3.0.0']);
    assert.equal(await db.count(resourceChanges, { where: { ordinal: 3000000 } }), 0);
    assert.deepEqual(
      (await db.query(resourceTypes).orderBy('resource_type', 'asc').all()).map((row) => [
        row.resource_type,
        row.latest_version,
        row.latest_status,
      ]),
      [
        ['AWS::Test::Gone', '1.0.0', 'added'],
        ['AWS::Test::Kept', '1.0.0', 'added'],
      ],
    );
  });
});

describe('invalidationPaths', () => {
  it('includes the changed versions and their neighbors', () => {
    const comparable = ['1.0.0', '2.0.0', '3.0.0', '4.0.0'].map((version) => ({ version })) as never;
    assert.deepEqual(invalidationPaths(comparable, ['2.0.0']), [
      '/',
      '/sitemap.xml',
      '/resources*',
      '/version/1.0.0',
      '/version/2.0.0',
      '/version/3.0.0',
    ]);
  });
});
