import type { SQSRecord } from 'aws-lambda';
import * as assert from 'remix/assert';
import { number, object } from 'remix/data-schema';
import { describe, it } from 'remix/test';

import { queueWrapper } from './queue-wrapper.ts';

const schema = object({ value: number() });

function sqsRecord(messageId: string, body: string): SQSRecord {
  return {
    messageId,
    body,
    receiptHandle: messageId,
    attributes: {
      ApproximateReceiveCount: '1',
      SentTimestamp: '0',
      SenderId: 'sender',
      ApproximateFirstReceiveTimestamp: '0',
    },
    messageAttributes: {},
    md5OfBody: '',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:queue',
    awsRegion: 'us-east-1',
  };
}

describe('queueWrapper', () => {
  it('passes each parsed message and its record to the processor', async () => {
    const processed: { message: { value: number }; record: SQSRecord }[] = [];
    const handler = queueWrapper(schema, async (message, record) => {
      processed.push({ message, record });
    });
    const record = sqsRecord('m1', JSON.stringify({ value: 1 }));
    const result = await handler({ Records: [record] });
    assert.deepEqual(result.batchItemFailures, []);
    assert.deepEqual(processed, [{ message: { value: 1 }, record }]);
  });

  it('reports a record that is not JSON, does not match the schema, or fails to process', async () => {
    const processed: { value: number }[] = [];
    const handler = queueWrapper(schema, async (message) => {
      if (message.value === 3) throw new Error('processing failed');
      processed.push(message);
    });
    const result = await handler({
      Records: [
        sqsRecord('good', JSON.stringify({ value: 1 })),
        sqsRecord('malformed', 'not json'),
        sqsRecord('invalid', JSON.stringify({ value: 'two' })),
        sqsRecord('failed', JSON.stringify({ value: 3 })),
      ],
    });
    assert.deepEqual(result.batchItemFailures, [
      { itemIdentifier: 'malformed' },
      { itemIdentifier: 'invalid' },
      { itemIdentifier: 'failed' },
    ]);
    assert.deepEqual(processed, [{ value: 1 }]);
  });
});
