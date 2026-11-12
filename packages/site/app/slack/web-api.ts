import { setTimeout } from 'node:timers/promises';
import { boolean, type InferOutput, literal, object, optional, parse, string, union } from 'remix/data-schema';
import { Config } from '#app/config.ts';

const accessUrl = 'https://slack.com/api/oauth.v2.access';
const postMessageUrl = 'https://slack.com/api/chat.postMessage';

const accessResponseSchema = union([
  object({
    ok: literal(true),
    access_token: string(),
    scope: optional(string()),
    bot_user_id: optional(string()),
    app_id: string(),
    team: object({ id: string(), name: string() }),
    incoming_webhook: optional(object({ channel_id: optional(string()), url: optional(string()) })),
  }),
  object({
    ok: literal(false),
    error: optional(string()),
  }),
]);

const postMessageResponseSchema = object({
  ok: boolean(),
  error: optional(string()),
});

export type SlackAccessGrant = Extract<InferOutput<typeof accessResponseSchema>, { ok: true }>;

export interface SlackSectionBlock {
  type: 'section';
  text: { type: 'mrkdwn'; text: string };
}

export interface SlackMessage {
  channel: string;
  text: string;
  blocks: SlackSectionBlock[];
  unfurl_links: boolean;
  unfurl_media: boolean;
}

export class SlackWebApi {
  static async exchangeCode(code: string): Promise<SlackAccessGrant> {
    const { clientId, clientSecret, redirectUri } = Config.slack();
    const response = await fetch(accessUrl, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        ...(redirectUri && { redirect_uri: redirectUri }),
      }),
    });
    const body = parse(accessResponseSchema, await response.json());
    if (!body.ok) throw new Error(`Slack oauth.v2.access failed: ${body.error ?? response.status}`);
    return body;
  }

  static async postMessage(token: string, message: SlackMessage): Promise<void> {
    const response = await fetch(postMessageUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(message),
    });
    if (response.status === 429) {
      await setTimeout(Number(response.headers.get('Retry-After') ?? 1) * 1000);
      return SlackWebApi.postMessage(token, message);
    }
    const result = parse(postMessageResponseSchema, await response.json());
    if (!result.ok) throw new Error(`Slack chat.postMessage failed: ${result.error ?? response.status}`);
  }
}
