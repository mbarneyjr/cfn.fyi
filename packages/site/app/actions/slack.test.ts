import { createHmac } from 'node:crypto';
import * as assert from 'remix/assert';
import { after, afterEach, beforeEach, describe, it } from 'remix/test';

import { slackInstallations } from '#app/database/slack-installations.ts';
import { router } from '#app/router.ts';
import { routes } from '#app/routes.ts';
import { createTestDatabase } from '../../db/test-database.ts';

const db = await createTestDatabase();
const originalFetch = globalThis.fetch;
const authorizeUrl = 'https://slack.com/oauth/v2/authorize?client_id=1.2&scope=incoming-webhook';

const access = {
  ok: true,
  access_token: 'xoxb-token',
  scope: 'incoming-webhook',
  bot_user_id: 'U1',
  app_id: 'A1',
  team: { id: 'T1', name: 'Team One' },
  incoming_webhook: { channel_id: 'C1', url: 'https://hooks.slack.com/services/T1/B1/x' },
};

const stateFrom = async () => {
  const response = await router.fetch(new URL(routes.slackInstall.href(), 'http://localhost'));
  const cookie = (response.headers.get('Set-Cookie') ?? '').split(';')[0];
  const state = new URL(response.headers.get('Location') ?? '').searchParams.get('state');
  return { response, cookie, state };
};

const callback = (query: string, cookie?: string) =>
  router.fetch(
    new Request(new URL(`${routes.slackCallback.href()}?${query}`, 'http://localhost'), {
      headers: cookie ? { Cookie: cookie } : {},
    }),
  );

const signingSecret = 'signing-secret';

describe('slack', () => {
  beforeEach(() => {
    process.env.SLACK_AUTHORIZE_URL = authorizeUrl;
    process.env.SLACK_CLIENT_ID = '1.2';
    process.env.SLACK_CLIENT_SECRET = 'secret';
    process.env.SLACK_SIGNING_SECRET = signingSecret;
    process.env.SLACK_SCOPES = 'incoming-webhook,chat:write,chat:write.public';
  });

  afterEach(async () => {
    delete process.env.SLACK_REDIRECT_URI;
    globalThis.fetch = originalFetch;
    await db.query(slackInstallations).delete();
  });

  after(() => db.close());

  it('links the navbar to the notify page', async () => {
    const html = await (await router.fetch(new URL('/missing', 'http://localhost'))).text();
    assert.match(html, /<a [^>]*href="\/notify"[^>]*>Notify Me/);
  });

  it('links the notify page to the installation as a document navigation', async () => {
    const response = await router.fetch(new URL(routes.notify.href(), 'http://localhost'));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<a [^>]*href="\/slack\/install"[^>]*data-rmx-document/);
  });

  it('shows the installation outcome on the notify page and ignores an unknown outcome', async () => {
    const shown = await router.fetch(new URL(`${routes.notify.href()}?slack=denied`, 'http://localhost'));
    assert.match(await shown.text(), /cancelled/);
    const ignored = await router.fetch(new URL(`${routes.notify.href()}?slack=<b>x</b>`, 'http://localhost'));
    assert.doesNotMatch(await ignored.text(), /role="status"/);
  });

  it('redirects to Slack with a state and sets the state cookie', async () => {
    const { response, cookie, state } = await stateFrom();
    const location = new URL(response.headers.get('Location') ?? '');
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(location.searchParams.get('client_id'), '1.2');
    assert.equal(location.searchParams.get('scope'), 'incoming-webhook,chat:write,chat:write.public');
    assert.ok(state);
    assert.ok(cookie.startsWith('slack_oauth_state='));
    assert.match(response.headers.get('Set-Cookie') ?? '', /HttpOnly/);
  });

  it('sends the configured redirect URI to Slack and with the code exchange', async () => {
    process.env.SLACK_REDIRECT_URI = 'http://localhost:44100/slack/oauth/callback';
    let body: URLSearchParams | undefined;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      body = init.body as URLSearchParams;
      return Response.json(access);
    }) as typeof fetch;
    const { response, cookie, state } = await stateFrom();
    const location = new URL(response.headers.get('Location') ?? '');
    assert.equal(location.searchParams.get('redirect_uri'), process.env.SLACK_REDIRECT_URI);
    await callback(`code=abc&state=${state}`, cookie);
    assert.equal(body?.get('redirect_uri'), process.env.SLACK_REDIRECT_URI);
  });

  it('stores the installation after a valid callback', async () => {
    let request: { url: string; body: URLSearchParams } | undefined;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      request = { url, body: init.body as URLSearchParams };
      return Response.json(access);
    }) as typeof fetch;
    const { cookie, state } = await stateFrom();
    const response = await callback(`code=abc&state=${state}`, cookie);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('Location'), '/notify?slack=installed');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(request?.url, 'https://slack.com/api/oauth.v2.access');
    assert.equal(request?.body.get('code'), 'abc');
    assert.equal(request?.body.get('client_secret'), 'secret');
    const row = await db.find(slackInstallations, 'T1');
    assert.equal(row?.access_token, 'xoxb-token');
    assert.equal(row?.channel_id, 'C1');
  });

  it('replaces the installation of a team that installs again', async () => {
    globalThis.fetch = (async () => Response.json(access)) as typeof fetch;
    for (const token of ['xoxb-old', 'xoxb-new']) {
      access.access_token = token;
      const { cookie, state } = await stateFrom();
      await callback(`code=abc&state=${state}`, cookie);
    }
    const rows = await db.query(slackInstallations).all();
    assert.deepEqual(
      rows.map((row) => row.access_token),
      ['xoxb-new'],
    );
  });

  it('rejects a callback whose state does not match the cookie', async () => {
    globalThis.fetch = (async () => {
      throw new Error('must not call Slack');
    }) as typeof fetch;
    const { cookie } = await stateFrom();
    assert.equal((await callback('code=abc&state=other', cookie)).headers.get('Location'), '/notify?slack=invalid');
    assert.equal((await callback('code=abc&state=other')).headers.get('Location'), '/notify?slack=invalid');
    assert.equal((await db.query(slackInstallations).all()).length, 0);
  });

  it('reports a cancelled installation without calling Slack', async () => {
    const response = await callback('error=access_denied');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('Location'), '/notify?slack=denied');
  });

  it('reports a failed token exchange', async () => {
    globalThis.fetch = (async () => Response.json({ ok: false, error: 'invalid_code' })) as typeof fetch;
    const { cookie, state } = await stateFrom();
    const response = await callback(`code=bad&state=${state}`, cookie);
    assert.equal(response.headers.get('Location'), '/notify?slack=failed');
    assert.equal((await db.query(slackInstallations).all()).length, 0);
  });

  const installation = { app_id: 'A1', access_token: 'xoxb-1', scope: 'chat:write', installed_at: '2026-01-01' };
  const seed = () =>
    db.createMany(slackInstallations, [
      { ...installation, team_id: 'T1', team_name: 'One' },
      { ...installation, team_id: 'T2', team_name: 'Two' },
    ]);

  const send = (payload: object, { key = signingSecret, age = 0 } = {}) => {
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000) - age);
    const signature = `v0=${createHmac('sha256', key).update(`v0:${timestamp}:${body}`).digest('hex')}`;
    return router.fetch(
      new Request(new URL(routes.slackEvents.href(), 'http://localhost'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Slack-Request-Timestamp': timestamp,
          'X-Slack-Signature': signature,
        },
        body,
      }),
    );
  };

  const teams = async () => (await db.query(slackInstallations).all()).map((row) => row.team_id).sort();
  const event = (type: string, extra: object = {}) => ({
    type: 'event_callback',
    team_id: 'T1',
    event: { type, ...extra },
  });

  it('rejects a request with a wrong signature or an old timestamp', async () => {
    await seed();
    assert.equal((await send(event('app_uninstalled'), { key: 'other' })).status, 401);
    assert.equal((await send(event('app_uninstalled'), { age: 301 })).status, 401);
    assert.deepEqual(await teams(), ['T1', 'T2']);
  });

  it('answers the URL verification challenge without caching', async () => {
    const response = await send({ type: 'url_verification', challenge: 'abc' });
    assert.equal(await response.text(), 'abc');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  });

  it('removes the installation of a team that uninstalled the app', async () => {
    await seed();
    assert.equal((await send(event('app_uninstalled'))).status, 200);
    assert.deepEqual(await teams(), ['T2']);
  });

  it('removes the installation when the bot token is revoked and keeps it for user tokens only', async () => {
    await seed();
    await send(event('tokens_revoked', { tokens: { oauth: ['U1'] } }));
    assert.deepEqual(await teams(), ['T1', 'T2']);
    await send(event('tokens_revoked', { tokens: { bot: ['B1'] } }));
    assert.deepEqual(await teams(), ['T2']);
  });
});
