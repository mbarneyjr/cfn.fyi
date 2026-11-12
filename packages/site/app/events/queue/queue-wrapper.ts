import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import { parse, type Schema } from 'remix/data-schema';
import { Logger } from '#app/logger.ts';

export function queueWrapper<Message>(
  schema: Schema<unknown, Message>,
  process: (message: Message, record: SQSRecord) => Promise<void>,
) {
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    Logger.info('lambda event received', { lambdaEvent: event });
    const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];
    for (const record of event.Records) {
      await Logger.run({ messageId: record.messageId }, async () => {
        try {
          await process(parse(schema, JSON.parse(record.body)), record);
        } catch (error) {
          Logger.error('queue record failed', { error });
          batchItemFailures.push({ itemIdentifier: record.messageId });
        }
      });
    }
    return { batchItemFailures };
  };
}
