import { css, type Handle } from 'remix/component';
import type { Status } from '#app/data/comparison.ts';
import { routes } from '#app/routes.ts';
import { Badge, chevron, entryHeader, invisible, row, summaryRow, TypeName } from '#app/ui/pages/changelog/changes.tsx';
import { Document } from '#app/ui/pages/lib/document.tsx';
import { border, color, layout, space, text } from '#app/ui/public/styles.ts';

export interface ResourceSummary {
  type: string;
  status: Status;
  version: string;
}

const list = css({ listStyle: 'none', padding: 0, margin: 0 });

const entry = css({
  '--link-color': 'var(--color-ink)',
  '&:hover': { backgroundColor: 'var(--color-sheet)' },
});

function services(resources: ResourceSummary[]) {
  const groups = new Map<string, ResourceSummary[]>();
  for (const resource of resources) {
    const service = resource.type.slice(0, resource.type.lastIndexOf('::'));
    groups.set(service, [...(groups.get(service) ?? []), resource]);
  }
  return [...groups];
}

export function ResourcesPage(handle: Handle<{ resources: ResourceSummary[] }>) {
  return () => {
    const { resources } = handle.props;
    const title = 'cfn.fyi · CloudFormation resource types';
    const description = 'Each resource type in the AWS CloudFormation resource specification, with its latest change.';
    const header = [layout.row, space.padBlock2, entryHeader];
    return (
      <Document title={title} description={description} path={routes.resources.href()}>
        <div mix={[layout.stack, space.gap4]}>
          <header mix={[layout.stack, space.gap3]}>
            <h1 mix={text.title}>Resource types</h1>
            <p mix={color.muted}>{description}</p>
          </header>
          <div mix={[layout.cells, layout.stack]}>
            {services(resources).map(([service, members]) => (
              <details key={service}>
                <summary mix={[...header, row, summaryRow]}>
                  <span aria-hidden="true" mix={chevron}>
                    ▸
                  </span>
                  <TypeName name={service} />
                  <span mix={[text.small, text.tabular, color.muted]}>{members.length}</span>
                </summary>
                <ul mix={[list, border.top]}>
                  {members.map((resource) => (
                    <li key={resource.type}>
                      <a
                        href={routes.resource.href({ type: resource.type })}
                        mix={[...header, text.noUnderline, entry]}
                      >
                        <span aria-hidden="true" mix={[chevron, invisible]}>
                          ▸
                        </span>
                        <Badge status={resource.status} />
                        <span mix={[layout.grow, text.bold, text.breakAnywhere]}>
                          {resource.type.slice(service.length + 2)}
                        </span>
                        <span mix={[text.small, text.tabular, color.muted]}>{resource.version}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      </Document>
    );
  };
}
