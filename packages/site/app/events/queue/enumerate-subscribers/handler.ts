import { type InferOutput, number, object, string } from 'remix/data-schema';
import { SQS } from '#app/aws/sqs.ts';
import { EmailSubscribersTable } from '#app/database/email-subscribers.ts';
import { SlackInstallationsTable } from '#app/database/slack-installations.ts';
import { Logger } from '#app/logger.ts';
import { queueWrapper } from '../queue-wrapper.ts';
import type { Delivery } from '../send-notification/handler.ts';

export const readyVersionSchema = object({
  version: string(),
  ordinal: number(),
});

export type ReadyVersion = InferOutput<typeof readyVersionSchema>;

export async function enumerateSubscribers({ version, ordinal }: ReadyVersion): Promise<Delivery[]> {
  const teamIds = await SlackInstallationsTable.listTeamIds();
  const emails = await EmailSubscribersTable.listConfirmedEmails();
  return [
    ...teamIds.map((teamId): Delivery => ({ channel: 'slack', subscriber: teamId, version, ordinal })),
    ...emails.map((email): Delivery => ({ channel: 'email', subscriber: email, version, ordinal })),
  ];
}

export const handler = queueWrapper(readyVersionSchema, async (readyVersion, _record) => {
  const deliveries = await enumerateSubscribers(readyVersion);
  await SQS.batchSendMessage('delivery', deliveries);
  Logger.info('enumerated subscribers', { readyVersion, deliveries: deliveries.length });
});
