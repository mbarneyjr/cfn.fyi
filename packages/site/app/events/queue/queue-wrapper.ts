import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import { parse, type Schema } from 'remix/data-schema';

export function queueWrapper<Message>(
  schema: Schema<unknown, Message>,
  process: (message: Message, record: SQSRecord) => Promise<void>,
) {
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];
    for (const record of event.Records) {
      try {
        await process(parse(schema, JSON.parse(record.body)), record);
      } catch (error) {
        console.error(
          JSON.stringify({ message: 'queue record failed', messageId: record.messageId, error: String(error) }),
        );
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }
    return { batchItemFailures };
  };
}
