import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { router } from '#app/router.ts';
import { routes } from '#app/routes.ts';

const base = routes.index.href();

const listing =
  '<ListBucketResult><CommonPrefixes><Prefix>1.0.0/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>2.0.0/</Prefix></CommonPrefixes></ListBucketResult>';

async function storage(input: string | URL | Request) {
  const url = new URL(input instanceof Request ? input.url : input);
  return url.searchParams.has('list-type') ? new Response(listing) : new Response(null, { status: 404 });
}

const index = (path: string) => router.fetch(new URL(path, 'http://localhost'));

describe('changelog', () => {
  it('builds the hrefs', () => {
    assert.equal(routes.index.href(), '/');
    assert.equal(routes.index.href({ version: '1.0.0' }), '/1.0.0');
    assert.equal(routes.changes.href({ version: '1.0.0' }), '/changes/1.0.0');
  });

  it(`GET ${base} returns the changelog page for the latest version`, async (t) => {
    t.mock.method(globalThis, 'fetch', storage);
    const response = await index(base);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    const html = await response.text();
    assert.match(html, /<title>cfn\.fyi · CloudFormation specification changelog<\/title>/);
    assert.match(html, /What changed in CloudFormation/);
    assert.match(html, /2\.0\.0/);
  });

  it('renders a version from the path', async (t) => {
    t.mock.method(globalThis, 'fetch', storage);
    const response = await index('/1.0.0');
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<title>cfn\.fyi · Version 1\.0\.0<\/title>/);
    assert.match(html, /Version 1\.0\.0<\/h1>/);
  });

  it('redirects a version query to the version path', async () => {
    const response = await index('/?version=1.0.0');
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('Location'), '/1.0.0');
  });

  it('rejects an unknown version path', async (t) => {
    t.mock.method(globalThis, 'fetch', storage);
    const response = await index('/9.9.9');
    assert.equal(response.status, 404);
    assert.match(await response.text(), /<title>cfn\.fyi · Not found<\/title>/);
  });

  it('rejects an unknown version', async (t) => {
    t.mock.method(globalThis, 'fetch', storage);
    const response = await router.fetch(new URL(routes.changes.href({ version: '9.9.9' }), 'http://localhost'));
    assert.equal(response.status, 404);
  });
});
