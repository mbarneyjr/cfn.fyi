import * as assert from 'remix/assert';
import { after, before, describe, it } from 'remix/test';

import { resourceChanges, versions } from '#app/data/tables.ts';
import { createAppRouter } from '#app/router.ts';
import { routes } from '#app/routes.ts';
import { createTestDatabase } from '../../db/test-database.ts';

const db = await createTestDatabase();
const router = createAppRouter({ db });
const base = routes.index.href();

const index = (path: string) => router.fetch(new URL(path, 'http://localhost'));

const block = {
  id: 'aws-test-thing',
  name: 'AWS::Test::Thing',
  status: 'added',
  lines: [{ depth: 0, mark: '+', key: { text: 'Type' }, value: { text: 'AWS::Test::Thing' } }],
};

describe('changelog', () => {
  before(async () => {
    const seen = '2026-01-01T00:00:00.000Z';
    await db.createMany(versions, [
      {
        version: '1.0.0',
        ordinal: 1000000,
        status: 'ready',
        published_at: '2026-01-01T00:00:00.000Z',
        first_seen_at: seen,
      },
      { version: '1.5.0', ordinal: 1005000, status: 'unavailable', first_seen_at: seen },
      { version: '3.0.0', ordinal: 3000000, status: 'pending', first_seen_at: seen },
      {
        version: '2.0.0',
        ordinal: 2000000,
        status: 'ready',
        published_at: '2026-02-01T00:00:00.000Z',
        first_seen_at: seen,
      },
    ]);
    await db.create(resourceChanges, {
      resource_type: block.name,
      ordinal: 2000000,
      version: '2.0.0',
      status: 'added',
      block: JSON.stringify(block),
      block_sha256: 'hash',
    });
  });

  after(() => db.close());

  it('builds the hrefs', () => {
    assert.equal(routes.index.href(), '/');
    assert.equal(routes.version.href({ version: '1.0.0' }), '/version/1.0.0');
  });

  it(`GET ${base} returns the changelog page for the latest version with its changes`, async () => {
    const response = await index(base);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    const html = await response.text();
    assert.match(html, /<title>cfn\.fyi · CloudFormation specification changelog<\/title>/);
    assert.match(html, /What changed in CloudFormation/);
    assert.match(html, /2\.0\.0/);
    assert.match(html, /2026-02-01/);
    assert.match(html, /Added resource types/);
    assert.match(html, /id="aws-test-thing"/);
  });

  it('renders a version from the path', async () => {
    const response = await index('/version/1.0.0');
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<title>cfn\.fyi · CloudFormation specification version 1\.0\.0<\/title>/);
    assert.match(html, /Version 1\.0\.0<\/h1>/);
    assert.match(html, /No changes in this version/);
    assert.match(
      html,
      /<script type="speculationrules">\{"prerender":\[\{"urls":\["\/version\/2\.0\.0"\]\}\]\}<\/script>/,
    );
  });

  it('rejects an unknown version path', async () => {
    const response = await index('/version/9.9.9');
    assert.equal(response.status, 404);
    assert.match(await response.text(), /<title>cfn\.fyi · Not found<\/title>/);
  });

  it('rejects an unavailable version path', async () => {
    const response = await index('/version/1.5.0');
    assert.equal(response.status, 404);
  });

  it('hides a pending version until its changes are built', async () => {
    assert.equal((await index('/version/3.0.0')).status, 404);
    assert.doesNotMatch(await (await index(base)).text(), /3\.0\.0/);
  });

  it('rejects an unknown path', async () => {
    const response = await index('/1.0.0');
    assert.equal(response.status, 404);
    assert.match(await response.text(), /<title>cfn\.fyi · Not found<\/title>/);
  });

  it('serves robots.txt with the sitemap location', async () => {
    const response = await index(routes.robots.href());
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Sitemap: https:\/\/cfn\.fyi\/sitemap\.xml/);
  });

  it('serves a sitemap of every ready version', async () => {
    const response = await index(routes.sitemap.href());
    assert.equal(response.status, 200);
    const xml = await response.text();
    assert.match(xml, /<loc>https:\/\/cfn\.fyi\/version\/1\.0\.0<\/loc>/);
    assert.match(xml, /<loc>https:\/\/cfn\.fyi\/<\/loc>/);
    assert.doesNotMatch(xml, /1\.5\.0/);
    assert.doesNotMatch(xml, /<loc>https:\/\/cfn\.fyi\/version\/2\.0\.0<\/loc>/);
  });
});
