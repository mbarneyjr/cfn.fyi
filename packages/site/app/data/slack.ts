import { createHmac, timingSafeEqual } from 'node:crypto';
import { array, type InferOutput, object, optional, parseSafe, string } from 'remix/data-schema';
import { Config } from '#app/config.ts';
import { SlackInstallationsTable } from '#app/database/slack-installations.ts';
import { Logger } from '#app/logger.ts';
import type { SlackAccessGrant } from '#app/slack/web-api.ts';

const eventPayloadSchema = object({
  type: string(),
  challenge: optional(string()),
  team_id: optional(string()),
  event: optional(
    object({
      type: string(),
      tokens: optional(object({ bot: optional(array(string())) })),
    }),
  ),
});

type EventPayload = InferOutput<typeof eventPayloadSchema>;

const signatureToleranceSeconds = 300;

export const noStore = { 'Cache-Control': 'no-store' };

function verifySignature(headers: Headers, body: string) {
  const timestamp = headers.get('X-Slack-Request-Timestamp');
  const signature = headers.get('X-Slack-Signature');
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > signatureToleranceSeconds) {
    return false;
  }
  const hmac = createHmac('sha256', Config.slack().signingSecret).update(`v0:${timestamp}:${body}`);
  const expected = Buffer.from(`v0=${hmac.digest('hex')}`);
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const revokesBot = (event: EventPayload['event']) =>
  event?.type === 'app_uninstalled' || (event?.type === 'tokens_revoked' && !!event.tokens?.bot?.length);

export async function receiveEvent(request: Request) {
  const body = await request.text();
  if (!verifySignature(request.headers, body)) return new Response(null, { status: 401, headers: noStore });
  const parsed = parseSafe(eventPayloadSchema, JSON.parse(body));
  if (!parsed.success) return new Response(null, { status: 400, headers: noStore });
  const payload = parsed.value;
  if (payload.type === 'url_verification') {
    return new Response(payload.challenge ?? '', { headers: { ...noStore, 'Content-Type': 'text/plain' } });
  }
  if (payload.type === 'event_callback' && payload.team_id && revokesBot(payload.event)) {
    await SlackInstallationsTable.delete(payload.team_id);
    Logger.info('installation removed', { teamId: payload.team_id, eventType: payload.event?.type });
  }
  return new Response(null, { headers: noStore });
}

export function authorizeUrl(state: string) {
  const { authorizeUrl, redirectUri, scopes } = Config.slack();
  const url = new URL(authorizeUrl);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', state);
  if (redirectUri) url.searchParams.set('redirect_uri', redirectUri);
  return url.toString();
}

export async function saveInstallation(grant: SlackAccessGrant) {
  await SlackInstallationsTable.upsert({
    team_id: grant.team.id,
    team_name: grant.team.name,
    app_id: grant.app_id,
    bot_user_id: grant.bot_user_id ?? null,
    access_token: grant.access_token,
    scope: grant.scope ?? '',
    channel_id: grant.incoming_webhook?.channel_id ?? null,
    webhook_url: grant.incoming_webhook?.url ?? null,
    installed_at: new Date().toISOString(),
  });
}
