import { type Status, statuses } from '#app/data/comparison.ts';
import type { ResourceChange } from '#app/database/resource-changes.ts';
import { routes } from '#app/routes.ts';
import type { SlackSectionBlock } from '#app/slack/web-api.ts';
import { slug } from '#app/ui/pages/changelog/lines.ts';

const sectionLimit = 3000;
const blockLimit = 50;
const labels: Record<Status, string> = { added: 'Added', modified: 'Modified', removed: 'Removed' };

const section = (text: string): SlackSectionBlock => ({ type: 'section', text: { type: 'mrkdwn', text } });

function statusSections(status: Status, changes: ResourceChange[], versionUrl: URL) {
  const texts = [`*${labels[status]}*`];
  for (const change of changes) {
    const line = `• <${versionUrl}#${slug(change.resource_type)}|\`${change.resource_type}\`>`;
    if (texts[texts.length - 1].length + line.length + 1 > sectionLimit) texts.push(line);
    else texts[texts.length - 1] += `\n${line}`;
  }
  return texts.map(section);
}

export function versionMessages(version: string, changes: ResourceChange[], siteUrl: string) {
  const versionUrl = new URL(routes.version.href({ version }), siteUrl);
  const title = 'AWS CloudFormation resource specification';
  const summary = `${changes.length} resource ${changes.length === 1 ? 'type' : 'types'} changed`;
  const blocks = [
    section(`*${title} <${versionUrl}|${version}>*\n${summary}`),
    ...statuses.flatMap((status) => {
      const matching = changes.filter((change) => change.status === status);
      return matching.length ? statusSections(status, matching, versionUrl) : [];
    }),
  ];
  return Array.from({ length: Math.ceil(blocks.length / blockLimit) }, (_, index) => ({
    text: `${title} ${version}: ${summary}`,
    blocks: blocks.slice(index * blockLimit, (index + 1) * blockLimit),
  }));
}
