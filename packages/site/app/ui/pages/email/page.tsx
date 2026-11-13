import type { Handle } from 'remix/component';
import { Document } from '#app/ui/pages/lib/document.tsx';
import { color, layout, space, text } from '#app/ui/public/styles.ts';

interface EmailActionPageProps {
  path: string;
  action: string;
}

export function EmailUnsubscribePage(handle: Handle<EmailActionPageProps>) {
  return () => {
    const { path, action } = handle.props;
    const description = 'Remove the email subscription to cfn.fyi.';
    return (
      <Document title="cfn.fyi · Unsubscribe" description={description} path={path} noindex>
        <form method="POST" action={action} data-rmx-document mix={[layout.stack, space.gap3]}>
          <h1 mix={text.title}>Unsubscribe</h1>
          <p mix={color.muted}>cfn.fyi will send no more email to this address.</p>
          <p>
            <button type="submit">Unsubscribe</button>
          </p>
        </form>
      </Document>
    );
  };
}
