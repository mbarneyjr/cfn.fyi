import { css, type Handle } from 'remix/component';
import type { Changelog, Status } from '#app/data/comparison.ts';
import { routes } from '#app/routes.ts';
import { Document } from '#app/ui/pages/lib/document.tsx';
import { color, layout, space, text } from '#app/ui/public/styles.ts';
import { Badge, ChangelogChanges } from './changes.tsx';
import { ChangelogNavigation, type Neighbor } from './public/navigation.tsx';

interface ChangelogPageProps {
  home: boolean;
  versions: string[];
  version: string;
  date?: string;
  previous?: Neighbor;
  next?: Neighbor;
  changelog: Changelog;
}

const statuses: Status[] = ['added', 'modified', 'removed'];

const legend = css({ listStyle: 'none', padding: 0, margin: 0 });

export function ChangelogPage(handle: Handle<ChangelogPageProps>) {
  return () => {
    const { home, changelog, ...navigation } = handle.props;
    const { version, date, previous, next } = navigation;
    const neighbors = [previous, next].flatMap((neighbor) =>
      neighbor ? [routes.version.href({ version: neighbor.version })] : [],
    );
    const title = home
      ? 'cfn.fyi · CloudFormation specification changelog'
      : `cfn.fyi · CloudFormation specification version ${version}`;
    const description = home
      ? 'Each version of the AWS CloudFormation resource specification, compared with the version before it.'
      : `Resource types added, modified, and removed in version ${version} of the AWS CloudFormation resource specification${
          date ? `, issued ${date}` : ''
        }${previous ? `, compared with version ${previous.version}` : ''}.`;
    return (
      <Document
        title={title}
        description={description}
        path={home || version === navigation.versions.at(-1) ? routes.index.href() : routes.version.href({ version })}
        page={{ headline: title, description, datePublished: date }}
      >
        <script type="speculationrules">{JSON.stringify({ prerender: [{ urls: neighbors }] })}</script>
        <div mix={[layout.stack, space.gap4]}>
          <header mix={[layout.stack, space.gap3]}>
            <div mix={[layout.stack, space.gap1]}>
              <h1 mix={text.title}>{home ? 'What changed in CloudFormation' : `Version ${version}`}</h1>
              {date && (
                <p mix={[color.muted, text.tabular]}>
                  {home ? `Latest version ${version}, issued ` : 'Issued '}
                  <time datetime={date}>{date}</time>
                </p>
              )}
            </div>
            <p mix={color.muted}>
              cfn.fyi compares each version of the AWS CloudFormation resource specification with the version before it.
              See new resource types and changed properties as AWS releases them.
            </p>
            <ul mix={[layout.cluster, space.gap3, text.small, legend]}>
              {statuses.map((status) => (
                <li key={status} mix={[layout.row, space.gap2]}>
                  <span aria-hidden="true">
                    <Badge status={status} />
                  </span>
                  {status}
                </li>
              ))}
            </ul>
          </header>
          <ChangelogNavigation {...navigation} />
          <ChangelogChanges changelog={changelog} />
          <ChangelogNavigation {...navigation} />
        </div>
      </Document>
    );
  };
}
