import type { Handle, RemixNode } from 'remix/component';
import type { EmailMessage } from '#app/aws/ses.ts';
import type { Diff, Status } from '#app/data/comparison.ts';
import type { ResourceChange } from '#app/database/resource-changes.ts';
import { colors, EmailDocument, hairline, renderDocument, specificationTitle, tokenUrl } from '#app/email/document.tsx';
import { routes } from '#app/routes.ts';
import { type Block, type Mark, render } from '#app/ui/pages/changelog/lines.ts';

const marks: Record<Mark, { label: string; glyph: string; color: string; wash: string }> = {
  '+': { label: 'added', glyph: '+', color: colors.added.light, wash: colors.addedWash.light },
  '-': { label: 'removed', glyph: '−', color: colors.removed.light, wash: colors.removedWash.light },
  '~': { label: 'modified', glyph: '~', color: colors.modified.light, wash: colors.modifiedWash.light },
};

const statusMarks: Record<Status, Mark> = { added: '+', modified: '~', removed: '-' };

const groupTitles: [Status, string][] = [
  ['added', 'Added resource types'],
  ['modified', 'Modified resource types'],
  ['removed', 'Removed resource types'],
];

function Badge(handle: Handle<{ status: Status }>) {
  return () => {
    const mark = marks[statusMarks[handle.props.status]];
    return (
      <span
        title={mark.label}
        class={`cfn-badge-${mark.label}`}
        style={{
          display: 'inline-block',
          width: '20px',
          height: '20px',
          lineHeight: '18px',
          textAlign: 'center',
          verticalAlign: 'middle',
          border: `1px solid ${mark.color}`,
          color: mark.color,
          backgroundColor: mark.wash,
          fontWeight: 'bold',
          boxSizing: 'border-box',
        }}
      >
        {mark.glyph}
      </span>
    );
  };
}

function TypeName(handle: Handle<{ name: string; href: string }>) {
  return () => {
    const { name, href } = handle.props;
    const parts = name.split(/(?<=::)/);
    const last = parts.pop();
    return (
      <a
        href={href}
        class="cfn-foreground"
        style={{ color: colors.foreground.light, textDecoration: 'none', verticalAlign: 'middle' }}
      >
        {parts.map((part) => (
          <span key={part} class="cfn-muted" style={{ color: colors.muted.light }}>
            {part}
          </span>
        ))}
        <span style={{ fontWeight: 'bold' }}>{last}</span>
      </a>
    );
  };
}

function EntryRow(handle: Handle<{ block: Block; versionUrl: string }>) {
  return () => {
    const { block, versionUrl } = handle.props;
    return (
      <tr>
        <td
          class="cfn-background cfn-border"
          style={{ padding: '8px 16px', border: hairline, backgroundColor: colors.background.light }}
        >
          <Badge status={block.status} /> <TypeName name={block.name} href={`${versionUrl}#${block.id}`} />
          {block.href && (
            <>
              {'  '}
              <a
                href={block.href}
                class="cfn-brand"
                style={{ color: colors.brand.light, fontSize: '13px', whiteSpace: 'nowrap' }}
              >
                docs ↗
              </a>
            </>
          )}
        </td>
      </tr>
    );
  };
}

function counter(index: number) {
  return String(index + 1).padStart(2, '0');
}

interface VersionEmailProps {
  subject: string;
  siteUrl: string;
  versionUrl: string;
  version: string;
  date?: string;
  blocks: Block[];
  footer: RemixNode;
}

function VersionEmail(handle: Handle<VersionEmailProps>) {
  return () => {
    const { subject, siteUrl, versionUrl, version, date, blocks, footer } = handle.props;
    const groups = groupTitles
      .map(([status, groupTitle]) => ({
        status,
        groupTitle,
        blocks: blocks.filter((block) => block.status === status),
      }))
      .filter((group) => group.blocks.length > 0);
    return (
      <EmailDocument subject={subject} siteUrl={siteUrl} footer={footer}>
        <h1 style={{ margin: '0 0 4px', fontSize: '28px', lineHeight: '1.15' }}>
          <a
            href={versionUrl}
            class="cfn-foreground"
            style={{ color: colors.foreground.light, textDecoration: 'none' }}
          >
            Version {version}
          </a>
        </h1>
        {date && (
          <p class="cfn-muted" style={{ margin: '0 0 16px', color: colors.muted.light }}>
            Issued {date}
          </p>
        )}
        <p class="cfn-muted" style={{ margin: '0 0 24px', color: colors.muted.light }}>
          cfn.fyi compares each version of the {specificationTitle} with the version before it.{' '}
          <a href={versionUrl} class="cfn-brand" style={{ color: colors.brand.light }}>
            View the diffs on cfn.fyi
          </a>
        </p>
        {blocks.length === 0 && (
          <p class="cfn-muted" style={{ margin: '0', color: colors.muted.light }}>
            No changes in this version.
          </p>
        )}
        {groups.map((group, index) => (
          <div key={group.status} style={{ margin: '0 0 48px' }}>
            <h2
              class="cfn-border"
              style={{ margin: '0 0 16px', paddingBottom: '4px', borderBottom: hairline, fontSize: '18px' }}
            >
              <span class="cfn-brand" style={{ color: colors.brand.light }}>
                {counter(index)}
              </span>{' '}
              {group.groupTitle}{' '}
              <span class="cfn-muted" style={{ color: colors.muted.light, fontWeight: 'normal' }}>
                {group.blocks.length}
              </span>
            </h2>
            <table
              role="presentation"
              width="100%"
              cellPadding="0"
              cellSpacing="0"
              style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}
            >
              <tbody>
                {group.blocks.map((block) => (
                  <EntryRow key={block.name} block={block} versionUrl={versionUrl} />
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </EmailDocument>
    );
  };
}

export async function versionMessage(
  email: string,
  token: string,
  version: string,
  date: string | undefined,
  changes: ResourceChange[],
  siteUrl: string,
): Promise<EmailMessage> {
  const subject = `${specificationTitle} ${version}`;
  const versionUrl = new URL(routes.version.href({ version }), siteUrl).toString();
  const unsubscribeUrl = tokenUrl(routes.emailUnsubscribeForm.href(), token, siteUrl);
  const summary = `${changes.length} resource ${changes.length === 1 ? 'type' : 'types'} changed`;
  const blocks = changes
    .map((change) => render(JSON.parse(change.diff) as Diff))
    .sort((a, b) => a.name.localeCompare(b.name));
  const footer = (
    <p style={{ margin: '0' }}>
      You get this email because you subscribed on cfn.fyi.{' '}
      <a href={unsubscribeUrl} class="cfn-muted" style={{ color: colors.muted.light }}>
        Unsubscribe
      </a>
    </p>
  );
  const html = await renderDocument(
    <VersionEmail
      subject={subject}
      siteUrl={siteUrl}
      versionUrl={versionUrl}
      version={version}
      date={date}
      blocks={blocks}
      footer={footer}
    />,
  );
  const text = [
    `${subject}: ${summary}`,
    ...(date ? [`Issued ${date}`] : []),
    versionUrl,
    ...groupTitles.flatMap(([status, groupTitle]) => {
      const matching = blocks.filter((block) => block.status === status);
      return matching.length
        ? ['', `${groupTitle} (${matching.length})`, ...matching.map((block) => `- ${block.name}`)]
        : [];
    }),
    '',
    `Unsubscribe: ${unsubscribeUrl}`,
    '',
  ].join('\n');
  return {
    to: email,
    subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
