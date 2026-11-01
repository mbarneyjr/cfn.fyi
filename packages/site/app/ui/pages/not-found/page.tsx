import type { Handle } from 'remix/component';
import { Document } from '#app/ui/pages/lib/document.tsx';
import { color, layout, space, text } from '#app/ui/public/styles.ts';

interface NotFoundPageProps {
  path: string;
}

export function NotFoundPage(handle: Handle<NotFoundPageProps>) {
  return () => {
    const { path } = handle.props;
    return (
      <Document title="cfn.fyi · Not found" description="The requested page does not exist." path={path}>
        <header mix={[layout.stack, space.gap2, text.alignCenter]}>
          <p mix={[text.label, color.brand]}>404</p>
          <h1 mix={text.title}>Not found</h1>
        </header>
      </Document>
    );
  };
}
