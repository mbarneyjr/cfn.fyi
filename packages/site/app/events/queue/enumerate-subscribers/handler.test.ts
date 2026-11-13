import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { emailSubscribers } from '#app/database/email-subscribers.ts';
import { slackInstallations } from '#app/database/slack-installations.ts';
import { createTestDatabase } from '../../../../db/test-database.ts';
import { enumerateSubscribers } from './handler.ts';

const seen = '2026-01-01T00:00:00.000Z';

describe('enumerateSubscribers', () => {
  it('returns one delivery for each installation and confirmed email subscriber', async (t) => {
    const db = await createTestDatabase();
    t.after(() => db.close());
    const installation = { app_id: 'A1', access_token: 'xoxb-1', scope: 'chat:write', installed_at: seen };
    await db.createMany(slackInstallations, [
      { ...installation, team_id: 'T1', team_name: 'One', channel_id: 'C1' },
      { ...installation, team_id: 'T2', team_name: 'Two', channel_id: 'C2' },
    ]);
    await db.createMany(emailSubscribers, [
      { email: 'a@example.com', token: 'token-a', status: 'confirmed', requested_at: seen, confirmed_at: seen },
      { email: 'b@example.com', token: 'token-b', status: 'pending', requested_at: seen },
    ]);
    assert.deepEqual(await enumerateSubscribers({ version: '2.0.0', ordinal: 2000000 }), [
      { channel: 'slack', subscriber: 'T1', version: '2.0.0', ordinal: 2000000 },
      { channel: 'slack', subscriber: 'T2', version: '2.0.0', ordinal: 2000000 },
      { channel: 'email', subscriber: 'a@example.com', version: '2.0.0', ordinal: 2000000 },
    ]);
  });
});
