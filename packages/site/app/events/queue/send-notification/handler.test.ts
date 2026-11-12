import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { compare } from '#app/data/comparison.ts';
import { versionMessages } from '#app/data/slack-messages.ts';
import type { Specification } from '#app/data/specification.ts';
import { resourceChanges } from '#app/database/resource-changes.ts';
import { resourceTypes } from '#app/database/resource-types.ts';
import { slackInstallations } from '#app/database/slack-installations.ts';
import { versions } from '#app/database/versions.ts';
import { createTestDatabase } from '../../../../db/test-database.ts';
import { type Delivery, sendNotification } from './handler.ts';

const seen = '2026-01-01T00:00:00.000Z';
const siteUrl = 'https://dev.cfn.fyi';

const specification = (version: string, resources: Record<string, string[]>): Specification => ({
  ResourceSpecificationVersion: version,
  ResourceTypes: Object.fromEntries(
    Object.entries(resources).map(([name, properties]) => [
      name,
      { Properties: Object.fromEntries(properties.map((property) => [property, { PrimitiveType: 'String' }])) },
    ]),
  ),
  PropertyTypes: {},
});

const diffs = compare(
  specification('1.0.0', { 'AWS::Test::B': ['Name'], 'AWS::Test::C': ['Name'] }),
  specification('2.0.0', { 'AWS::Test::A': ['Name'], 'AWS::Test::B': ['Name', 'Size'] }),
);

async function setup(t: { after(callback: () => unknown): void }) {
  const db = await createTestDatabase();
  t.after(() => db.close());
  await db.createMany(versions, [
    { version: '1.0.0', ordinal: 1000000, status: 'ready', first_seen_at: seen },
    { version: '2.0.0', ordinal: 2000000, status: 'ready', first_seen_at: seen },
  ]);
  await db.createMany(
    resourceTypes,
    diffs.map((diff) => ({ resource_type: diff.name, latest_version: '2.0.0', latest_status: diff.status })),
  );
  await db.createMany(
    resourceChanges,
    diffs.map((diff) => ({
      resource_type: diff.name,
      ordinal: 2000000,
      version: '2.0.0',
      status: diff.status,
      diff: JSON.stringify(diff),
      diff_sha256: 'hash',
    })),
  );
  const installation = { app_id: 'A1', access_token: 'xoxb-1', scope: 'chat:write', installed_at: seen };
  await db.createMany(slackInstallations, [
    { ...installation, team_id: 'T1', team_name: 'One', channel_id: 'C1' },
    { ...installation, team_id: 'T2', team_name: 'Two', channel_id: 'C2' },
  ]);
  return db;
}

const delivery: Delivery = { channel: 'slack', subscriber: 'T1', version: '2.0.0', ordinal: 2000000 };

const recorder = () => {
  const posts: {
    channel: string;
    text: string;
    unfurl_links?: boolean;
    unfurl_media?: boolean;
    authorization: string | null;
  }[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => {
    posts.push({
      ...JSON.parse(init.body as string),
      authorization: new Headers(init.headers).get('Authorization'),
    });
    return Response.json({ ok: true });
  }) as typeof fetch;
  return { posts, fetcher };
};

describe('sendNotification', () => {
  it('posts one message with the version and the changed types', async (t) => {
    await setup(t);
    const { posts, fetcher } = recorder();
    t.mock.method(globalThis, 'fetch', fetcher);
    assert.equal(await sendNotification(delivery, siteUrl), 'sent');
    assert.deepEqual(
      posts.map((post) => post.text),
      ['AWS CloudFormation resource specification 2.0.0: 3 resource types changed'],
    );
    assert.ok(posts.every((post) => post.channel === 'C1' && post.authorization === 'Bearer xoxb-1'));
    assert.ok(posts.every((post) => post.unfurl_links === false && post.unfurl_media === false));
  });

  it('sends a delivery at most once', async (t) => {
    const db = await setup(t);
    const { posts, fetcher } = recorder();
    t.mock.method(globalThis, 'fetch', fetcher);
    await sendNotification(delivery, siteUrl);
    assert.equal(await sendNotification(delivery, siteUrl), 'skipped');
    assert.equal(await sendNotification({ ...delivery, version: '1.0.0', ordinal: 1000000 }, siteUrl), 'skipped');
    assert.equal(posts.length, 1);
    assert.equal((await db.find(slackInstallations, 'T1'))?.notified_ordinal, 2000000);
  });

  it('does not retry a delivery that Slack rejected', async (t) => {
    await setup(t);
    let calls = 0;
    const fetcher = (async () => {
      calls++;
      return Response.json({ ok: false, error: 'channel_not_found' });
    }) as typeof fetch;
    t.mock.method(globalThis, 'fetch', fetcher);
    assert.equal(await sendNotification(delivery, siteUrl), 'failed');
    assert.equal(await sendNotification(delivery, siteUrl), 'skipped');
    assert.equal(calls, 1);
  });

  it('waits and posts again when Slack limits the rate', async (t) => {
    await setup(t);
    const { posts, fetcher } = recorder();
    let limited = false;
    const limiter = (async (url: string, init: RequestInit) => {
      if (!limited) {
        limited = true;
        return new Response(null, { status: 429, headers: { 'Retry-After': '0' } });
      }
      return fetcher(url, init);
    }) as typeof fetch;
    t.mock.method(globalThis, 'fetch', limiter);
    assert.equal(await sendNotification(delivery, siteUrl), 'sent');
    assert.equal(posts.length, 1);
  });
});

describe('versionMessages', () => {
  const change = (diff: (typeof diffs)[number]) => ({
    resource_type: diff.name,
    ordinal: 2000000,
    version: '2.0.0',
    status: diff.status,
    diff: JSON.stringify(diff),
    diff_sha256: 'hash',
  });

  it('groups the types by status and links each type to its diff on the version page', () => {
    const [message] = versionMessages('2.0.0', diffs.map(change), siteUrl);
    const texts = (message.blocks as { text: { text: string } }[]).map((block) => block.text.text);
    assert.deepEqual(texts, [
      '*AWS CloudFormation resource specification <https://dev.cfn.fyi/version/2.0.0|2.0.0>*\n3 resource types changed',
      '*Added*\n• <https://dev.cfn.fyi/version/2.0.0#aws-test-a|`AWS::Test::A`>',
      '*Modified*\n• <https://dev.cfn.fyi/version/2.0.0#aws-test-b|`AWS::Test::B`>',
      '*Removed*\n• <https://dev.cfn.fyi/version/2.0.0#aws-test-c|`AWS::Test::C`>',
    ]);
  });

  it('keeps each section and message within the Slack limits', () => {
    const resources = Object.fromEntries(
      Array.from({ length: 3000 }, (_, index) => [`AWS::Test::R${index}`, ['Name']]),
    );
    const changes = compare(undefined, specification('2.0.0', resources)).map(change);
    const messages = versionMessages('2.0.0', changes, siteUrl);
    const sections = messages.flatMap((message) => message.blocks) as { text: { text: string } }[];
    assert.ok(messages.length > 1);
    assert.ok(messages.every((message) => message.blocks.length <= 50));
    assert.ok(sections.every((section) => section.text.text.length <= 3000));
    assert.equal(
      sections
        .map((section) => section.text.text)
        .join('\n')
        .split('• ').length - 1,
      3000,
    );
  });
});
