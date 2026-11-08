import * as assert from 'remix/assert';
import { after, before, describe, it } from 'remix/test';

import { resourceChanges, resourceTypes, versions } from '#app/data/tables.ts';
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
      { version: '0.5.0', ordinal: 5000, status: 'ready', first_seen_at: seen },
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
    const change = {
      resource_type: block.name,
      status: 'added' as const,
      block: JSON.stringify(block),
      block_sha256: 'hash',
    };
    await db.create(resourceTypes, {
      resource_type: block.name,
      latest_version: '2.0.0',
      latest_status: 'modified',
    });
    await db.createMany(resourceChanges, [
      { ...change, ordinal: 5000, version: '0.5.0' },
      {
        ...change,
        ordinal: 2000000,
        version: '2.0.0',
        status: 'modified',
        block: JSON.stringify({ ...block, status: 'modified' }),
      },
      { ...change, ordinal: 3000000, version: '3.0.0' },
    ]);
  });

  after(() => db.close());

  it('retries a request after a database conflict', async () => {
    let failures = 0;
    const flaky = new Proxy(db, {
      get(target, property) {
        if (property === 'query' && failures === 0) {
          return () => {
            failures++;
            throw Object.assign(new Error('schema has been updated by another transaction'), { code: '40001' });
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const response = await createAppRouter({ db: flaky }).fetch(new URL(base, 'http://localhost'));
    assert.equal(response.status, 200);
    assert.equal(failures, 1);
  });

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
    assert.match(html, /Modified resource types/);
    assert.match(html, /id="aws-test-thing"/);
    assert.match(html, /<a href="\/resources\/AWS%3A%3ATest%3A%3AThing"[^>]*>history<\/a>/);
  });

  it('omits the history link for an added resource type', async () => {
    const html = await (await index('/version/0.5.0')).text();
    assert.match(html, /Added resource types/);
    assert.doesNotMatch(html, />history<\/a>/);
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
      /<script type="speculationrules">\{"prerender":\[\{"urls":\["\/version\/0\.5\.0","\/version\/2\.0\.0"\]\}\]\}<\/script>/,
    );
  });

  it('links to the resource types from the navbar', async () => {
    assert.match(await (await index(base)).text(), /<a href="\/resources">Resources<\/a>/);
  });

  it('lists each resource type with the latest ready version that changed it', async () => {
    const response = await index(routes.resources.href());
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<title>cfn\.fyi · CloudFormation resource types<\/title>/);
    assert.match(html, /<a href="\/">Versions<\/a>/);
    assert.doesNotMatch(html, />Resources<\/a>/);
    assert.match(html, /<details><summary[^>]*>.*AWS::.*Test.*>1<\/span><\/summary>/);
    assert.match(html, /href="\/resources\/AWS%3A%3ATest%3A%3AThing"[^>]*>.*>Thing<\/span>/);
    assert.match(html, /2\.0\.0/);
    assert.doesNotMatch(html, /3\.0\.0/);
  });

  it('renders the latest change to a resource type with navigation through its changes only', async () => {
    const response = await index(routes.resource.href({ type: block.name }));
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<title>cfn\.fyi · AWS::Test::Thing changes<\/title>/);
    assert.match(html, /<a href="\/resources"[^>]*>← Resource types<\/a>/);
    assert.match(html, /<a href="\/version\/2\.0\.0"[^>]*>Version 2\.0\.0<\/a>/);
    assert.match(html, /<div id="aws-test-thing"><h3/);
    assert.doesNotMatch(html, /<details|expand all/);
    assert.match(html, /href="\/resources\/AWS%3A%3ATest%3A%3AThing\/0\.5\.0" rel="prev"/);
    assert.match(html, /This is the latest change/);
    assert.doesNotMatch(html, />history<\/a>/);
    assert.doesNotMatch(html, /1\.0\.0/);
    assert.doesNotMatch(html, /3\.0\.0/);
  });

  it('renders a resource type at a version that changed it', async () => {
    const response = await index('/resources/AWS::Test::Thing/0.5.0');
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<title>cfn\.fyi · AWS::Test::Thing changes in version 0\.5\.0<\/title>/);
    assert.match(html, /This is the first change/);
  });

  it('rejects a resource type at a version that did not change it', async () => {
    assert.equal((await index('/resources/AWS::Test::Thing/1.0.0')).status, 404);
    assert.equal((await index('/resources/AWS::Test::Thing/3.0.0')).status, 404);
    assert.equal((await index('/resources/AWS::Test::Unknown')).status, 404);
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
    assert.match(xml, /<loc>https:\/\/cfn\.fyi\/resources<\/loc>/);
    assert.match(xml, /<loc>https:\/\/cfn\.fyi\/resources\/AWS%3A%3ATest%3A%3AThing<\/loc>/);
    assert.doesNotMatch(xml, /1\.5\.0/);
    assert.doesNotMatch(xml, /<loc>https:\/\/cfn\.fyi\/version\/2\.0\.0<\/loc>/);
  });
});
