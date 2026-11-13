import { html } from 'remix/html-template';
import type { Diff, Status } from '#app/data/comparison.ts';
import type { ResourceChange } from '#app/database/resource-changes.ts';
import type { Version } from '#app/database/versions.ts';
import { routes } from '#app/routes.ts';
import { render } from '#app/ui/pages/changelog/lines.ts';
import { origin } from '#app/ui/pages/lib/document.tsx';

export const feedLength = 20;

const groups: [Status, string, string][] = [
  ['added', 'Added resource types', '+'],
  ['modified', 'Modified resource types', '~'],
  ['removed', 'Removed resource types', '−'],
];

function item(version: Version, changes: ResourceChange[]) {
  const url = `${origin}${routes.version.href({ version: version.version })}`;
  const blocks = changes
    .map((change) => render(JSON.parse(change.diff) as Diff))
    .sort((a, b) => a.name.localeCompare(b.name));
  const summary = `${blocks.length} resource ${blocks.length === 1 ? 'type' : 'types'} changed`;
  const date = new Date((version.published_at ?? version.first_seen_at) as string | Date).toUTCString();
  const content = html`<p>cfn.fyi compares each version of the AWS CloudFormation resource specification with the version before it. <a href="${url}">View the diffs on cfn.fyi</a></p>${
    blocks.length ? null : html`<p>No changes in this version.</p>`
  }${groups.map(([status, title, glyph]) => {
    const matching = blocks.filter((block) => block.status === status);
    return matching.length
      ? html`<h2>${title} (${matching.length})</h2><ul>${matching.map(
          (block) =>
            html`<li>${glyph} <a href="${url}#${block.id}"><code>${block.name}</code></a>${
              block.href ? html` <a href="${block.href}">docs ↗</a>` : null
            }</li>`,
        )}</ul>`
      : null;
  })}`;
  return html`
    <item>
      <title>Version ${version.version}: ${summary}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${date}</pubDate>
      <description>${summary}</description>
      <content:encoded>${String(content)}</content:encoded>
    </item>`;
}

export function versionFeed(rows: Version[], changes: ResourceChange[]) {
  const items = rows.toReversed().map((row) =>
    item(
      row,
      changes.filter((change) => change.ordinal === row.ordinal),
    ),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
${html`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>cfn.fyi</title>
    <link>${origin}/</link>
    <atom:link href="${origin}${routes.feed.href()}" rel="self" type="application/rss+xml" />
    <description>Changes between versions of the AWS CloudFormation resource specification.</description>
    <language>en-us</language>${items}
  </channel>
</rss>`}
`;
}
