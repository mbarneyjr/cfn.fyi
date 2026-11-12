import { setTimeout } from 'node:timers/promises';
import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

import { Logger } from './logger.ts';

describe('Logger', () => {
  it('adds the context of the current operation to each entry', (t) => {
    const info = t.mock.method(console, 'info', () => {});
    Logger.run({ path: '/a' }, () => {
      Logger.run({ messageId: 'm1' }, () => Logger.info('nested', { value: 1 }));
      Logger.info('outer');
    });
    Logger.info('outside');
    assert.deepEqual(
      info.mock.calls.map((call) => JSON.parse(call.arguments[0])),
      [
        { event: 'nested', path: '/a', messageId: 'm1', value: 1 },
        { event: 'outer', path: '/a' },
        { event: 'outside' },
      ],
    );
  });

  it('keeps the context of concurrent operations separate', async (t) => {
    const info = t.mock.method(console, 'info', () => {});
    await Promise.all([
      Logger.run({ path: '/a' }, async () => {
        await setTimeout(10);
        Logger.info('first');
      }),
      Logger.run({ path: '/b' }, async () => {
        await setTimeout(1);
        Logger.info('second');
      }),
    ]);
    assert.deepEqual(
      info.mock.calls.map((call) => JSON.parse(call.arguments[0])),
      [
        { event: 'second', path: '/b' },
        { event: 'first', path: '/a' },
      ],
    );
  });
});
