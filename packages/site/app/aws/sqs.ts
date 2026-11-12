import { SendMessageBatchCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { InferOutput } from 'remix/data-schema';
import { Config } from '#app/config.ts';
import type { readyVersionSchema } from '#app/events/queue/enumerate-subscribers/handler.ts';
import type { deliverySchema } from '#app/events/queue/send-notification/handler.ts';

interface QueueMessages {
  delivery: InferOutput<typeof deliverySchema>;
  versionReady: InferOutput<typeof readyVersionSchema>;
}

export class SQS {
  static #client?: SQSClient;

  static get #sqs() {
    SQS.#client ??= new SQSClient({});
    return SQS.#client;
  }

  static async sendMessage<Queue extends keyof QueueMessages>(queue: Queue, message: QueueMessages[Queue]) {
    const url = Config.notifications().queueUrls[queue];
    if (!url) throw new Error(`The ${queue} queue URL is not set`);
    await SQS.#sqs.send(new SendMessageCommand({ QueueUrl: url, MessageBody: JSON.stringify(message) }));
  }

  static async batchSendMessage<Queue extends keyof QueueMessages>(queue: Queue, messages: QueueMessages[Queue][]) {
    const url = Config.notifications().queueUrls[queue];
    if (!url) throw new Error(`The ${queue} queue URL is not set`);
    for (let index = 0; index < messages.length; index += 10) {
      const entries = messages.slice(index, index + 10).map((message, offset) => ({
        Id: String(offset),
        MessageBody: JSON.stringify(message),
      }));
      const result = await SQS.#sqs.send(new SendMessageBatchCommand({ QueueUrl: url, Entries: entries }));
      if (result.Failed?.length)
        throw new Error(`Failed to send ${result.Failed.length} messages to the ${queue} queue`);
    }
  }
}
