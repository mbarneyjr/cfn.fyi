import { Frame, type Handle } from 'remix/component';
import { routes } from '#app/routes.ts';
import { Document } from '#app/ui/pages/lib/document.tsx';
import { color, layout, space, text } from '#app/ui/public/styles.ts';
import { ChangelogNavigation } from './public/navigation.tsx';
import type { Neighbor } from './specification.ts';

interface ChangelogPageProps {
  versions: string[];
  version: string;
  date?: string;
  previous?: Neighbor;
  next?: Neighbor;
}

export function ChangelogPage(handle: Handle<ChangelogPageProps>) {
  return () => {
    const { version } = handle.props;
    return (
      <Document
        title="cfn.fyi · CloudFormation specification changelog"
        description="Each version of the AWS CloudFormation resource specification, compared with the version before it."
        path={routes.index.href({ version })}
      >
        <div mix={[layout.stack, space.gap4]}>
          <header mix={[layout.stack, space.gap2]}>
            <h1 mix={text.title}>Resource specification {version}</h1>
            <p mix={color.muted}>
              Each version of the AWS CloudFormation resource specification, compared with the version before it.
            </p>
          </header>
          <ChangelogNavigation {...handle.props} />
          <Frame key={version} src={routes.changes.href({ version })} fallback={<p>Loading changes…</p>} />
          <ChangelogNavigation {...handle.props} />
        </div>
      </Document>
    );
  };
}
