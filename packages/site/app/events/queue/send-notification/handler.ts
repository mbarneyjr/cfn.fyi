import { type InferOutput, literal, number, object, string, variant } from 'remix/data-schema';
import { Config } from '#app/config.ts';
import { versionMessages } from '#app/data/slack-messages.ts';
import { ResourceChangesTable } from '#app/database/resource-changes.ts';
import { SlackInstallationsTable } from '#app/database/slack-installations.ts';
import { Logger } from '#app/logger.ts';
import { SlackWebApi } from '#app/slack/web-api.ts';
import { queueWrapper } from '../queue-wrapper.ts';

export const deliverySchema = variant('channel', {
  slack: object({
    channel: literal('slack'),
    subscriber: string(),
    version: string(),
    ordinal: number(),
  }),
});

export type Delivery = InferOutput<typeof deliverySchema>;

export async function sendNotification(delivery: Delivery, siteUrl: string) {
  if (!(await SlackInstallationsTable.claimNotification(delivery.subscriber, delivery.ordinal))) return 'skipped';
  try {
    const installation = await SlackInstallationsTable.find(delivery.subscriber);
    const channel = installation?.channel_id;
    if (!installation || !channel) throw new Error('Installation has no channel');
    const changes = await ResourceChangesTable.listByOrdinal(delivery.ordinal);
    for (const message of versionMessages(delivery.version, changes, siteUrl)) {
      await SlackWebApi.postMessage(installation.access_token, {
        channel,
        unfurl_links: false,
        unfurl_media: false,
        ...message,
      });
    }
    return 'sent';
  } catch (error) {
    Logger.error('notification failed', { delivery, error });
    return 'failed';
  }
}

export const handler = queueWrapper(deliverySchema, async (delivery) => {
  const outcome = await sendNotification(delivery, Config.notifications().siteUrl);
  Logger.info('notification processed', { outcome, delivery });
});
