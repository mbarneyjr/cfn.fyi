import * as assert from 'remix/assert';
import { after, afterEach, describe, it } from 'remix/test';

import { type EmailMessage, SES } from '#app/aws/ses.ts';
import { emailSubscribers } from '#app/database/email-subscribers.ts';
import { router } from '#app/router.ts';
import { routes } from '#app/routes.ts';
import { createTestDatabase } from '../../db/test-database.ts';

const db = await createTestDatabase();
const seen = '2026-01-01T00:00:00.000Z';

const post = (path: string, body: Record<string, string>) =>
  router.fetch(new Request(new URL(path, 'http://localhost'), { method: 'POST', body: new URLSearchParams(body) }));

const subscribe = (email: string) => post(routes.emailSubscribe.href(), { email });

const withToken = (path: string, token: string) => `${path}?${new URLSearchParams({ token })}`;

const confirm = (token: string) =>
  router.fetch(new URL(withToken(routes.emailConfirm.href(), token), 'http://localhost'));

describe('email subscription', () => {
  afterEach(async () => {
    await db.query(emailSubscribers).delete();
  });

  after(() => db.close());

  it('stores a pending subscriber and sends a confirmation link', async (t) => {
    const sent: EmailMessage[] = [];
    t.mock.method(SES, 'sendEmail', async (message: EmailMessage) => {
      sent.push(message);
    });
    const response = await subscribe('  A@Example.com ');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('Location'), '/notify?email=requested');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const subscriber = await db.find(emailSubscribers, 'a@example.com');
    assert.equal(subscriber?.status, 'pending');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'a@example.com');
    assert.ok(sent[0].text.includes(`/email/confirm?token=${subscriber?.token}`));
    assert.doesNotMatch(sent[0].html, /@layer|data-rmx-style/);
  });

  it('rejects an address that is not valid', async (t) => {
    const sendEmail = t.mock.method(SES, 'sendEmail', async () => {});
    const response = await subscribe('not-an-address');
    assert.equal(response.headers.get('Location'), '/notify?email=rejected');
    assert.equal(sendEmail.mock.calls.length, 0);
    assert.equal((await db.query(emailSubscribers).all()).length, 0);
  });

  it('does not send again to a recent request or to a confirmed subscriber', async (t) => {
    const sendEmail = t.mock.method(SES, 'sendEmail', async () => {});
    await subscribe('a@example.com');
    await subscribe('a@example.com');
    await db.create(emailSubscribers, {
      email: 'b@example.com',
      token: 'token-b',
      status: 'confirmed',
      requested_at: seen,
      confirmed_at: seen,
    });
    await subscribe('b@example.com');
    assert.equal(sendEmail.mock.calls.length, 1);
  });

  it('sends the same link again after the resend interval', async (t) => {
    const sent: EmailMessage[] = [];
    t.mock.method(SES, 'sendEmail', async (message: EmailMessage) => {
      sent.push(message);
    });
    await db.create(emailSubscribers, {
      email: 'a@example.com',
      token: 'token-a',
      status: 'pending',
      requested_at: seen,
    });
    await subscribe('a@example.com');
    assert.equal(sent.length, 1);
    assert.ok(sent[0].text.includes('/email/confirm?token=token-a'));
  });

  it('reports a failure to send the confirmation email', async (t) => {
    t.mock.method(SES, 'sendEmail', async () => {
      throw new Error('MessageRejected');
    });
    const response = await subscribe('a@example.com');
    assert.equal(response.headers.get('Location'), '/notify?email=failed');
  });

  it('confirms the subscription when the link opens', async () => {
    await db.create(emailSubscribers, {
      email: 'a@example.com',
      token: 'token-a',
      status: 'pending',
      requested_at: seen,
    });
    const response = await confirm('token-a');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('Location'), '/notify?email=confirmed');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal((await db.find(emailSubscribers, 'a@example.com'))?.status, 'confirmed');
    const again = await confirm('token-a');
    assert.equal(again.headers.get('Location'), '/notify?email=confirmed');
  });

  it('rejects an unknown or missing token', async () => {
    const unknown = await confirm('unknown');
    assert.equal(unknown.headers.get('Location'), '/notify?email=invalid');
    const missing = await router.fetch(new URL(routes.emailUnsubscribeForm.href(), 'http://localhost'));
    assert.equal(missing.headers.get('Location'), '/notify?email=invalid');
  });

  it('unsubscribes from the page and from a one-click request', async () => {
    await db.createMany(emailSubscribers, [
      { email: 'a@example.com', token: 'token-a', status: 'confirmed', requested_at: seen, confirmed_at: seen },
      { email: 'b@example.com', token: 'token-b', status: 'confirmed', requested_at: seen, confirmed_at: seen },
    ]);
    const page = await post(withToken(routes.emailUnsubscribe.href(), 'token-a'), {});
    assert.equal(page.headers.get('Location'), '/notify?email=unsubscribed');
    const oneClick = await post(withToken(routes.emailUnsubscribe.href(), 'token-b'), {
      'List-Unsubscribe': 'One-Click',
    });
    assert.equal(oneClick.status, 200);
    assert.equal((await db.query(emailSubscribers).all()).length, 0);
  });

  it('shows the outcome on the notify page', async () => {
    const html = await (await router.fetch(new URL('/notify?email=confirmed', 'http://localhost'))).text();
    assert.match(html, /role="status"[^>]*>The subscription is confirmed/);
    assert.match(html, /<form method="POST" action="\/email\/subscribe"/);
  });
});
