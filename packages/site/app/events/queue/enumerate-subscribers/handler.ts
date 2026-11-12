import { type InferOutput, number, object, string } from 'remix/data-schema';
import { SQS } from '#app/aws/sqs.ts';
import { SlackInstallationsTable } from '#app/database/slack-installations.ts';
import { queueWrapper } from '../queue-wrapper.ts';
import type { Delivery } from '../send-notification/handler.ts';

export const readyVersionSchema = object({
  version: string(),
  ordinal: number(),
});

export type ReadyVersion = InferOutput<typeof readyVersionSchema>;

export async function enumerateSubscribers({ version, ordinal }: ReadyVersion): Promise<Delivery[]> {
  const teamIds = await SlackInstallationsTable.listTeamIds();
  return teamIds.map((teamId) => ({
    channel: 'slack',
    subscriber: teamId,
    version,
    ordinal,
  }));
}

export const handler = queueWrapper(readyVersionSchema, async (readyVersion) => {
  const deliveries = await enumerateSubscribers(readyVersion);
  await SQS.batchSendMessage('delivery', deliveries);
  console.log(JSON.stringify({ message: 'enumerated subscribers', readyVersion, deliveries: deliveries.length }));
});
