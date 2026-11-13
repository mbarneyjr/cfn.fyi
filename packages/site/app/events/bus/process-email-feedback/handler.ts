import { array, type InferOutput, object, optional, parse, string } from 'remix/data-schema';
import { EmailSubscribersTable } from '#app/database/email-subscribers.ts';
import { Logger } from '#app/logger.ts';

const recipientsSchema = array(object({ emailAddress: string() }));

export const feedbackEventSchema = object({
  detail: object({
    eventType: string(),
    bounce: optional(object({ bounceType: string(), bouncedRecipients: recipientsSchema })),
    complaint: optional(object({ complainedRecipients: recipientsSchema })),
  }),
});

export type FeedbackEvent = InferOutput<typeof feedbackEventSchema>;

export function feedbackRecipients({ detail }: FeedbackEvent) {
  if (detail.eventType === 'Bounce' && detail.bounce?.bounceType === 'Permanent')
    return detail.bounce.bouncedRecipients;
  if (detail.eventType === 'Complaint' && detail.complaint) return detail.complaint.complainedRecipients;
  return [];
}

export async function processEmailFeedback(event: FeedbackEvent) {
  for (const { emailAddress } of feedbackRecipients(event)) {
    await EmailSubscribersTable.delete(emailAddress.trim().toLowerCase());
    Logger.info('email subscriber removed', { eventType: event.detail.eventType });
  }
}

export async function handler(event: unknown) {
  Logger.info('lambda event received', { lambdaEvent: event });
  await processEmailFeedback(parse(feedbackEventSchema, event));
}
