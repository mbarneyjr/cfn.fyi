import { type InferOutput, literal, number, object, string, variant } from 'remix/data-schema';
import { SES } from '#app/aws/ses.ts';
import { Config } from '#app/config.ts';
import { versionMessages } from '#app/data/slack-messages.ts';
import { EmailSubscribersTable } from '#app/database/email-subscribers.ts';
import { ResourceChangesTable } from '#app/database/resource-changes.ts';
import { SlackInstallationsTable } from '#app/database/slack-installations.ts';
import { VersionsTable } from '#app/database/versions.ts';
import { versionMessage } from '#app/email/templates/version.tsx';
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
  email: object({
    channel: literal('email'),
    subscriber: string(),
    version: string(),
    ordinal: number(),
  }),
});

export type Delivery = InferOutput<typeof deliverySchema>;

type SlackDelivery = Extract<Delivery, { channel: 'slack' }>;
type EmailDelivery = Extract<Delivery, { channel: 'email' }>;

async function sendSlackNotification(delivery: SlackDelivery, siteUrl: string) {
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

async function sendEmailNotification(delivery: EmailDelivery, siteUrl: string) {
  if (!(await EmailSubscribersTable.claimNotification(delivery.subscriber, delivery.ordinal))) return 'skipped';
  try {
    const subscriber = await EmailSubscribersTable.find(delivery.subscriber);
    if (!subscriber) throw new Error('Subscriber no longer exists');
    const changes = await ResourceChangesTable.listByOrdinal(delivery.ordinal);
    const publishedAt = (await VersionsTable.find(delivery.version))?.published_at;
    const date = publishedAt ? new Date(publishedAt as string | Date).toISOString().slice(0, 10) : undefined;
    await SES.sendEmail(
      await versionMessage(subscriber.email, subscriber.token, delivery.version, date, changes, siteUrl),
    );
    return 'sent';
  } catch (error) {
    Logger.error('notification failed', { delivery, error });
    return 'failed';
  }
}

export function sendNotification(delivery: Delivery, siteUrl: string) {
  if (delivery.channel === 'email') return sendEmailNotification(delivery, siteUrl);
  return sendSlackNotification(delivery, siteUrl);
}

export const handler = queueWrapper(deliverySchema, async (delivery, _record) => {
  const outcome = await sendNotification(delivery, Config.notifications().siteUrl);
  Logger.info('notification processed', { outcome, delivery });
});
