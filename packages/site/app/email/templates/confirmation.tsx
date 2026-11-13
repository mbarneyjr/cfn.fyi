import type { EmailMessage } from '#app/aws/ses.ts';
import { colors, EmailDocument, hairline, renderDocument, specificationTitle, tokenUrl } from '#app/email/document.tsx';
import { routes } from '#app/routes.ts';

export async function confirmationMessage(email: string, token: string, siteUrl: string): Promise<EmailMessage> {
  const subject = 'Confirm your cfn.fyi subscription';
  const confirmUrl = tokenUrl(routes.emailConfirm.href(), token, siteUrl);
  const request = `Confirm that you want an email when cfn.fyi publishes a new version of the ${specificationTitle}.`;
  const ignore = 'If you did not ask for this, ignore this email. cfn.fyi sends nothing more unless you confirm.';
  const html = await renderDocument(
    <EmailDocument subject={subject} siteUrl={siteUrl} footer={<p style={{ margin: '0' }}>{ignore}</p>}>
      <p style={{ margin: '0 0 16px' }}>{request}</p>
      <p style={{ margin: '0' }}>
        <a
          href={confirmUrl}
          class="cfn-border cfn-brand"
          style={{
            display: 'inline-block',
            padding: '4px 8px',
            border: hairline,
            color: colors.brand.light,
            textDecoration: 'none',
          }}
        >
          Confirm subscription
        </a>
      </p>
    </EmailDocument>,
  );
  const text = [request, '', `Confirm: ${confirmUrl}`, '', ignore, ''].join('\n');
  return { to: email, subject, html, text };
}
