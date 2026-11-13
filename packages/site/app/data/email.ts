import { randomBytes } from 'node:crypto';
import { parseSafe, string } from 'remix/data-schema';
import { email, maxLength } from 'remix/data-schema/checks';
import { SES } from '#app/aws/ses.ts';
import { EmailSubscribersTable } from '#app/database/email-subscribers.ts';
import { confirmationMessage } from '#app/email/templates/confirmation.tsx';

const addressSchema = string().pipe(email(), maxLength(254));
const resendIntervalMilliseconds = 10 * 60 * 1000;

export function parseAddress(value: FormDataEntryValue | null) {
  const result = parseSafe(addressSchema, typeof value === 'string' ? value.trim().toLowerCase() : value);
  return result.success ? result.value : undefined;
}

export async function requestSubscription(address: string, siteUrl: string) {
  const subscriber = await EmailSubscribersTable.find(address);
  if (subscriber?.status === 'confirmed') return;
  const now = new Date();
  if (
    subscriber &&
    now.getTime() - new Date(subscriber.requested_at as string | Date).getTime() < resendIntervalMilliseconds
  )
    return;
  const token = subscriber?.token ?? randomBytes(32).toString('base64url');
  if (subscriber) await EmailSubscribersTable.updateRequestedAt(address, now.toISOString());
  else await EmailSubscribersTable.create(address, token, now.toISOString());
  await SES.sendEmail(await confirmationMessage(address, token, siteUrl));
}

export async function confirmSubscription(token: string) {
  if (await EmailSubscribersTable.confirm(token, new Date().toISOString())) return 'confirmed';
  return (await EmailSubscribersTable.findByToken(token)) ? 'confirmed' : 'invalid';
}
