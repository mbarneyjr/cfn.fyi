import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { createDirectoryArchive } from '#app/data/archive.ts';
import { versions } from '#app/data/tables.ts';
import { createTestDatabase } from '../../db/test-database.ts';
import { synchronizeArchive } from './synchronize-archive.ts';

interface SourceObject {
  body: string;
  etag: string;
}

function source(objects: Record<string, SourceObject | undefined>) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.searchParams.has('list-type')) {
      const prefixes = Object.keys(objects).map(
        (version) => `<CommonPrefixes><Prefix>${version}/</Prefix></CommonPrefixes>`,
      );
      return new Response(`<ListBucketResult>${prefixes.join('')}</ListBucketResult>`);
    }
    const object = objects[url.pathname.split('/')[1]];
    if (!object) return new Response(null, { status: 403 });
    const headers = { etag: object.etag, 'last-modified': 'Thu, 29 Oct 2026 20:05:06 GMT' };
    return new Response(init?.method === 'HEAD' ? null : object.body, { headers });
  };
}

async function setup(t: { after(callback: () => unknown): void }) {
  const db = await createTestDatabase();
  const directory = await mkdtemp(join(tmpdir(), 'cfnfyi-archive-'));
  t.after(async () => {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { db, archive: createDirectoryArchive(directory) };
}

const object = (version: string, etag: string, resources = '{}'): SourceObject => ({
  body: `{"ResourceSpecificationVersion":"${version}","ResourceTypes":${resources},"PropertyTypes":{}}`,
  etag,
});

describe('synchronizeArchive', () => {
  it('archives new versions and records versions it cannot download', async (t) => {
    const { db, archive } = await setup(t);
    t.mock.method(globalThis, 'fetch', source({ '1.0.0': object('1.0.0', '"a"'), '2.0.0': undefined }));
    const result = await synchronizeArchive({ db, archive });
    assert.deepEqual(result, { archived: ['1.0.0'], unavailable: ['2.0.0'], removed: [], pending: 1 });
    const row = await db.find(versions, '1.0.0');
    assert.equal(row?.status, 'pending');
    assert.equal(row?.source_etag, '"a"');
    assert.equal((await db.find(versions, '2.0.0'))?.status, 'unavailable');
    const stored = JSON.parse(gunzipSync(await archive.read('1.0.0')).toString());
    assert.equal(stored.ResourceSpecificationVersion, '1.0.0');
  });

  it('archives a recent version again when its ETag and content change', async (t) => {
    const { db, archive } = await setup(t);
    t.mock.method(globalThis, 'fetch', source({ '1.0.0': object('1.0.0', '"a"') }));
    await synchronizeArchive({ db, archive });
    t.mock.method(globalThis, 'fetch', source({ '1.0.0': object('1.0.0', '"b"', '{"AWS::Test::New":{}}') }));
    const result = await synchronizeArchive({ db, archive });
    assert.deepEqual(result.archived, ['1.0.0']);
    const row = await db.find(versions, '1.0.0');
    assert.equal(row?.source_etag, '"b"');
    assert.ok(row?.updated_at);
  });

  it('updates the ETag without archiving when the content is the same', async (t) => {
    const { db, archive } = await setup(t);
    t.mock.method(globalThis, 'fetch', source({ '1.0.0': object('1.0.0', '"a"') }));
    await synchronizeArchive({ db, archive });
    t.mock.method(globalThis, 'fetch', source({ '1.0.0': object('1.0.0', '"b"') }));
    const result = await synchronizeArchive({ db, archive });
    assert.deepEqual(result.archived, []);
    assert.equal((await db.find(versions, '1.0.0'))?.source_etag, '"b"');
  });

  it('marks archived versions that the source no longer lists', async (t) => {
    const { db, archive } = await setup(t);
    t.mock.method(globalThis, 'fetch', source({ '1.0.0': object('1.0.0', '"a"'), '2.0.0': object('2.0.0', '"b"') }));
    await synchronizeArchive({ db, archive });
    t.mock.method(globalThis, 'fetch', source({ '2.0.0': object('2.0.0', '"b"') }));
    const result = await synchronizeArchive({ db, archive });
    assert.deepEqual(result.removed, ['1.0.0']);
    assert.ok((await db.find(versions, '1.0.0'))?.removed_at);
  });

  it('archives only the latest versions with a limit', async (t) => {
    const { db, archive } = await setup(t);
    t.mock.method(globalThis, 'fetch', source({ '1.0.0': object('1.0.0', '"a"'), '2.0.0': object('2.0.0', '"b"') }));
    const result = await synchronizeArchive({ db, archive, limit: 1 });
    assert.deepEqual(result.archived, ['2.0.0']);
  });

  it('reports versions that an earlier run left pending', async (t) => {
    const { db, archive } = await setup(t);
    t.mock.method(globalThis, 'fetch', source({ '1.0.0': object('1.0.0', '"a"') }));
    await synchronizeArchive({ db, archive });
    const result = await synchronizeArchive({ db, archive });
    assert.deepEqual(result.archived, []);
    assert.equal(result.pending, 1);
  });
});
