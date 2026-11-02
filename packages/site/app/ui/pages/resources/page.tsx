import { css, type Handle } from 'remix/component';
import type { Status } from '#app/data/comparison.ts';
import { routes } from '#app/routes.ts';
import { Badge, TypeName } from '#app/ui/pages/changelog/changes.tsx';
import { Document } from '#app/ui/pages/lib/document.tsx';
import { color, layout, space, text } from '#app/ui/public/styles.ts';

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

export function ResourcesPage(handle: Handle<{ resources: ResourceSummary[] }>) {
  return () => {
    const { resources } = handle.props;
    const title = 'cfn.fyi · CloudFormation resource types';
    const description = 'Each resource type in the AWS CloudFormation resource specification, with its latest change.';
    return (
      <Document title={title} description={description} path={routes.resources.href()}>
        <div mix={[layout.stack, space.gap4]}>
          <header mix={[layout.stack, space.gap3]}>
            <h1 mix={text.title}>Resource types</h1>
            <p mix={color.muted}>{description}</p>
          </header>
          <ul mix={[layout.cells, layout.stack, list]}>
            {resources.map((resource) => (
              <li key={resource.type}>
                <a
                  href={routes.resource.href({ type: resource.type })}
                  mix={[layout.row, space.gap2, space.padBlock2, space.padInline3, text.noUnderline, entry]}
                >
                  <Badge status={resource.status} />
                  <TypeName name={resource.type} />
                  <span mix={[text.small, text.tabular, color.muted]}>{resource.version}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Document>
    );
  };
}
