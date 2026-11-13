import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { emailSubscribers } from '#app/database/email-subscribers.ts';
import { createTestDatabase } from '../../../../db/test-database.ts';
import { handler } from './handler.ts';

const seen = '2026-01-01T00:00:00.000Z';

const event = (detail: object) => ({ source: 'aws.ses', 'detail-type': 'Email Bounced', detail });

async function setup(t: { after(callback: () => unknown): void }) {
  const db = await createTestDatabase();
  t.after(() => db.close());
  await db.create(emailSubscribers, {
    email: 'a@example.com',
    token: 'token-a',
    status: 'confirmed',
    requested_at: seen,
    confirmed_at: seen,
  });
  return db;
}

describe('processEmailFeedback', () => {
  it('removes a subscriber after a permanent bounce', async (t) => {
    const db = await setup(t);
    await handler(
      event({
        eventType: 'Bounce',
        bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'A@example.com' }] },
      }),
    );
    assert.equal(await db.find(emailSubscribers, 'a@example.com'), null);
  });

  it('keeps a subscriber after a transient bounce', async (t) => {
    const db = await setup(t);
    await handler(
      event({
        eventType: 'Bounce',
        bounce: { bounceType: 'Transient', bouncedRecipients: [{ emailAddress: 'a@example.com' }] },
      }),
    );
    assert.ok(await db.find(emailSubscribers, 'a@example.com'));
  });

  it('removes a subscriber after a complaint', async (t) => {
    const db = await setup(t);
    await handler(
      event({ eventType: 'Complaint', complaint: { complainedRecipients: [{ emailAddress: 'a@example.com' }] } }),
    );
    assert.equal(await db.find(emailSubscribers, 'a@example.com'), null);
  });
});
