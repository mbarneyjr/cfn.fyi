import type { Handle } from 'remix/component';
import { routes } from '#app/routes.ts';
import { Document } from '#app/ui/pages/lib/document.tsx';
import { border, color, layout, space, text } from '#app/ui/public/styles.ts';

export const slackOutcomes = ['installed', 'denied', 'invalid', 'failed'] as const;
export type SlackOutcome = (typeof slackOutcomes)[number];

const messages: Record<SlackOutcome, string> = {
  installed: 'The cfn.fyi app is installed. cfn.fyi will post in the channel you chose.',
  denied: 'The installation was cancelled. No notifications are enabled.',
  invalid: 'The installation request is not valid or has expired. Start again.',
  failed: 'Slack did not complete the installation. Start again.',
};

export function NotifyPage(handle: Handle<{ slack?: SlackOutcome }>) {
  return () => {
    const { slack } = handle.props;
    const description =
      'Get a message when cfn.fyi publishes a new version of the CloudFormation resource specification.';
    return (
      <Document title="cfn.fyi · Notify me" description={description} path={routes.notify.href()}>
        <div mix={[layout.stack, space.gap4]}>
          <header mix={[layout.stack, space.gap3]}>
            <h1 mix={text.title}>Notify me</h1>
            <p mix={color.muted}>{description}</p>
          </header>
          {slack && (
            <p role="status" mix={[border.top, border.bottom, space.padBlock3]}>
              {messages[slack]}
            </p>
          )}
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
