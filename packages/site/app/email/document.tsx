import type { Handle, RemixNode } from 'remix/component';
import { renderToString } from 'remix/component/server';
import { assets } from '#app/assets.ts';
import { tokens } from '#app/ui/public/tokens.ts';

const logoHref = await assets.getHref('app/ui/public/logo.png');
const darkLogoHref = await assets.getHref('app/ui/public/logo-dark.png');

function hex(hsl: string) {
  const [hue, saturation, lightness] = (hsl.match(/[\d.]+/g) ?? []).map(Number);
  const l = lightness / 100;
  const a = (saturation / 100) * Math.min(l, 1 - l);
  const channels = [0, 8, 4].map((offset) => {
    const k = (offset + hue / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

export const colors = Object.fromEntries(
  Object.entries(tokens.color).flatMap(([name, value]) =>
    typeof value === 'string' ? [] : [[name, { light: hex(value.light), dark: hex(value.dark) }]],
  ),
) as Record<Exclude<keyof typeof tokens.color, 'brandWash'>, { light: string; dark: string }>;

const font = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const specificationTitle = 'AWS CloudFormation resource specification';
export const hairline = `1px solid ${colors.border.light}`;

const darkStyles = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  .cfn-background { background-color: ${colors.background.dark} !important; }
  .cfn-foreground { color: ${colors.foreground.dark} !important; }
  .cfn-muted { color: ${colors.muted.dark} !important; }
  .cfn-brand { color: ${colors.brand.dark} !important; }
  .cfn-border { border-color: ${colors.border.dark} !important; }
  .cfn-badge-added { color: ${colors.added.dark} !important; border-color: ${colors.added.dark} !important; background-color: ${colors.addedWash.dark} !important; }
  .cfn-badge-modified { color: ${colors.modified.dark} !important; border-color: ${colors.modified.dark} !important; background-color: ${colors.modifiedWash.dark} !important; }
  .cfn-badge-removed { color: ${colors.removed.dark} !important; border-color: ${colors.removed.dark} !important; background-color: ${colors.removedWash.dark} !important; }
  .cfn-logo-light { display: none !important; }
  .cfn-logo-dark { display: inline-block !important; }
}
`;

interface EmailDocumentProps {
  subject: string;
  siteUrl: string;
  footer: RemixNode;
  children?: RemixNode;
}

export function EmailDocument(handle: Handle<EmailDocumentProps>) {
  return () => {
    const { subject, siteUrl, footer, children } = handle.props;
    return (
      <html lang="en-US">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content="light dark" />
          <meta name="supported-color-schemes" content="light dark" />
          <title>{subject}</title>
          <style>{darkStyles}</style>
        </head>
        <body
          class="cfn-background cfn-foreground"
          style={{
            margin: '0',
            padding: '24px 16px',
            backgroundColor: colors.background.light,
            color: colors.foreground.light,
            fontFamily: font,
            fontSize: '15px',
            lineHeight: '1.6',
          }}
        >
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            <p
              class="cfn-border"
              style={{
                margin: '0 0 24px',
                paddingBottom: '16px',
                borderBottom: hairline,
                fontSize: '18px',
                fontWeight: 'bold',
              }}
            >
              <a
                href={siteUrl}
                class="cfn-foreground"
                style={{ color: colors.foreground.light, textDecoration: 'none' }}
              >
                <img
                  src={new URL(logoHref, siteUrl).toString()}
                  width="28"
                  height="28"
                  alt=""
                  class="cfn-logo-light"
                  style={{ verticalAlign: 'middle', marginRight: '8px', border: '0' }}
                />
                <img
                  src={new URL(darkLogoHref, siteUrl).toString()}
                  width="28"
                  height="28"
                  alt=""
                  class="cfn-logo-dark"
                  style="display: none; mso-hide: all; vertical-align: middle; margin-right: 8px; border: 0;"
                />
                <span style={{ verticalAlign: 'middle' }}>
                  cfn
                  <span class="cfn-brand" style={{ color: colors.brand.light }}>
                    .fyi
                  </span>
                </span>
              </a>
            </p>
            {children}
            <div
              class="cfn-border cfn-muted"
              style={{
                marginTop: '48px',
                paddingTop: '16px',
                borderTop: hairline,
                color: colors.muted.light,
                fontSize: '13px',
              }}
            >
              {footer}
            </div>
          </div>
        </body>
      </html>
    );
  };
}

export async function renderDocument(node: RemixNode) {
  return `<!DOCTYPE html>${await renderToString(node)}`;
}

export function tokenUrl(path: string, token: string, siteUrl: string) {
  const url = new URL(path, siteUrl);
  url.searchParams.set('token', token);
  return url.toString();
}
