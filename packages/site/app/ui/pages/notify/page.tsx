import type { Handle } from 'remix/component';
import { routes } from '#app/routes.ts';
import { Document } from '#app/ui/pages/lib/document.tsx';
import { border, color, layout, space, text } from '#app/ui/public/styles.ts';

export const slackOutcomes = ['installed', 'denied', 'invalid', 'failed'] as const;
export type SlackOutcome = (typeof slackOutcomes)[number];

export const emailOutcomes = ['requested', 'rejected', 'failed', 'confirmed', 'unsubscribed', 'invalid'] as const;
export type EmailOutcome = (typeof emailOutcomes)[number];

const slackMessages: Record<SlackOutcome, string> = {
  installed: 'The cfn.fyi app is installed. cfn.fyi will post in the channel you chose.',
  denied: 'The installation was cancelled. No notifications are enabled.',
  invalid: 'The installation request is not valid or has expired. Start again.',
  failed: 'Slack did not complete the installation. Start again.',
};

const emailMessages: Record<EmailOutcome, string> = {
  requested: 'Check your inbox. Open the link in the email from cfn.fyi to confirm the subscription.',
  rejected: 'The email address is not valid. Enter a different address.',
  failed: 'cfn.fyi could not send the confirmation email. Try again later.',
  confirmed: 'The subscription is confirmed. cfn.fyi will send an email for each new version.',
  unsubscribed: 'The subscription is removed. cfn.fyi sends no more email to this address.',
  invalid: 'The link is not valid. Subscribe again.',
};

interface NotifyPageProps {
  slack?: SlackOutcome;
  email?: EmailOutcome;
}

export function NotifyPage(handle: Handle<NotifyPageProps>) {
  return () => {
    const { slack, email } = handle.props;
    const status = slack ? slackMessages[slack] : email && emailMessages[email];
    const description =
      'Get a message when cfn.fyi publishes a new version of the CloudFormation resource specification.';
    return (
      <Document title="cfn.fyi · Notify Me" description={description} path={routes.notify.href()}>
        <div mix={[layout.stack, space.gap4]}>
          <header mix={[layout.stack, space.gap3]}>
            <h1 mix={text.title}>Notify Me</h1>
            <p mix={color.muted}>{description}</p>
          </header>
          {status && (
            <p role="status" mix={[border.top, border.bottom, space.padBlock3]}>
              {status}
            </p>
          )}
          <section mix={[layout.stack, space.gap2]}>
            <h2 mix={[text.heading, border.rule]}>Email</h2>
            <p>Get one email for each new version. cfn.fyi sends a link to confirm the address first.</p>
            <form
              method="POST"
              action={routes.emailSubscribe.href()}
              data-rmx-document
              mix={[layout.cluster, space.gap2]}
            >
              <label for="email" mix={layout.visuallyHidden}>
                Email address
              </label>
              <input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required />
              <button type="submit">Subscribe</button>
            </form>
          </section>
          <section mix={[layout.stack, space.gap2]}>
            <h2 mix={[text.heading, border.rule]}>Slack</h2>
            <p>Install the cfn.fyi app in a workspace and choose a channel for the messages.</p>
            <p>
              <a href={routes.slackInstall.href()} data-rmx-document>
                Add to Slack
              </a>
            </p>
          </section>
        </div>
      </Document>
    );
  };
}
