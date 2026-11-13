import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { Config } from '#app/config.ts';
import { Logger } from '#app/logger.ts';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export class SES {
  static #client?: SESv2Client;

  static get #ses() {
    SES.#client ??= new SESv2Client({});
    return SES.#client;
  }

  static async sendEmail(message: EmailMessage) {
    const { fromAddress } = Config.email();
    if (!fromAddress) {
      Logger.info('email not sent because EMAIL_FROM_ADDRESS is not set', { to: message.to, text: message.text });
      return;
    }
    await SES.#ses.send(
      new SendEmailCommand({
        FromEmailAddress: fromAddress,
        Destination: { ToAddresses: [message.to] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: message.html, Charset: 'UTF-8' },
              Text: { Data: message.text, Charset: 'UTF-8' },
            },
            Headers: Object.entries(message.headers ?? {}).map(([Name, Value]) => ({ Name, Value })),
          },
        },
      }),
    );
  }
}
