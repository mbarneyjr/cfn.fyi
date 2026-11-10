import { css, type Handle } from 'remix/component';
import type { Status } from '#app/data/comparison.ts';
import { routes } from '#app/routes.ts';
import { Document } from '#app/ui/pages/lib/document.tsx';
import { color, layout, space, text } from '#app/ui/public/styles.ts';
import { Badge, ChangelogChanges } from './changes.tsx';
import type { Changelog } from './lines.ts';
import { ChangelogNavigation, type Neighbor, versionHref } from './public/navigation.tsx';

interface ChangelogPageProps {
  home: boolean;
  resourceType?: string;
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
    const { resourceType, version, date, previous, next } = navigation;
    const neighbors = [previous, next].flatMap((neighbor) =>
      neighbor ? [versionHref(neighbor.version, resourceType)] : [],
    );
    const latest = home || version === navigation.versions.at(-1);
    const issued = date ? `, issued ${date}` : '';
    const compared = previous ? `, compared with version ${previous.version}` : '';
    const title = resourceType
      ? `cfn.fyi · ${resourceType} changes${home ? '' : ` in version ${version}`}`
      : home
        ? 'cfn.fyi · CloudFormation specification changelog'
        : `cfn.fyi · CloudFormation specification version ${version}`;
    const description = resourceType
      ? `Changes to ${resourceType} in version ${version} of the AWS CloudFormation resource specification${issued}${compared}.`
      : home
        ? 'Each version of the AWS CloudFormation resource specification, compared with the version before it.'
        : `Resource types added, modified, and removed in version ${version} of the AWS CloudFormation resource specification${issued}${compared}.`;
    const path = resourceType
      ? routes.resource.href({ type: resourceType, version: latest ? undefined : version })
      : latest
        ? routes.index.href()
        : routes.version.href({ version });
    return (
      <Document
        title={title}
        description={description}
        path={path}
        page={{ headline: title, description, datePublished: date }}
      >
        <script type="speculationrules">{JSON.stringify({ prerender: [{ urls: neighbors }] })}</script>
        <div mix={[layout.stack, space.gap4]}>
          <header mix={[layout.stack, space.gap3]}>
            <div mix={[layout.stack, space.gap1]}>
              {resourceType && (
                <a href={routes.resources.href()} mix={text.small}>
                  ← Resource types
                </a>
              )}
              <h1 mix={[text.title, text.breakAnywhere]}>
                {resourceType ?? (home ? 'What changed in CloudFormation' : `Version ${version}`)}
              </h1>
              {resourceType ? (
                <p mix={[color.muted, text.tabular]}>
                  <a href={routes.version.href({ version })}>Version {version}</a>
                  {date && (
                    <>
                      , issued <time datetime={date}>{date}</time>
                    </>
                  )}
                </p>
              ) : (
                date && (
                  <p mix={[color.muted, text.tabular]}>
                    {home ? `Latest version ${version}, issued ` : 'Issued '}
                    <time datetime={date}>{date}</time>
                  </p>
                )
              )}
            </div>
            <p mix={color.muted}>
              {resourceType
                ? `Each version of the AWS CloudFormation resource specification that changed ${resourceType}, compared with the version before it.`
                : 'cfn.fyi compares each version of the AWS CloudFormation resource specification with the version before it. See new resource types and changed properties as AWS releases them.'}
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
          <ChangelogChanges changelog={changelog} resourceView={Boolean(resourceType)} />
          <ChangelogNavigation {...navigation} />
        </div>
      </Document>
    );
  };
}
