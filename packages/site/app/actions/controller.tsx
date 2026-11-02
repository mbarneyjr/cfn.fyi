import { createController } from 'remix/router';

import { assets } from '#app/assets.ts';
import type { Block } from '#app/data/comparison.ts';
import { resourceChanges, type Version, versions } from '#app/data/tables.ts';
import type { AppContext } from '#app/router.ts';
import { routes } from '#app/routes.ts';
import { ChangelogPage } from '#app/ui/pages/changelog/page.tsx';
import type { Neighbor } from '#app/ui/pages/changelog/public/navigation.tsx';
import { origin } from '#app/ui/pages/lib/document.tsx';
import { NotFoundPage } from '#app/ui/pages/not-found/page.tsx';

const document = (body: string, type: string, maxAge: number) =>
  new Response(body, {
    headers: { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': `public, max-age=0, s-maxage=${maxAge}` },
  });

const pageHeaders = { 'Cache-Control': 'public, max-age=0, s-maxage=300' };

const notFound = (context: AppContext) =>
  context.render(<NotFoundPage path={context.url.pathname} />, { status: 404, headers: pageHeaders });

const readyVersions = (context: AppContext) =>
  context.db.query(versions).where({ status: 'ready' }).orderBy('ordinal', 'asc').all();

const isoDate = (value: unknown) => (value ? new Date(value as string | Date).toISOString().slice(0, 10) : undefined);

const neighbor = (row?: Version): Neighbor | undefined =>
  row && { version: row.version, date: isoDate(row.published_at) };

async function changelog(context: AppContext, path?: string) {
  const rows = await readyVersions(context);
  const index = path ? rows.findIndex((row) => row.version === path) : rows.length - 1;
  const current = rows[index];
  if (!current) return notFound(context);
  const changes = await context.db.query(resourceChanges).where({ ordinal: current.ordinal }).all();
  const blocks = changes
    .map((change) => JSON.parse(change.block) as Block)
    .sort((a, b) => a.name.localeCompare(b.name));
  return context.render(
    <ChangelogPage
      home={!path}
      versions={rows.map((row) => row.version)}
      version={current.version}
      date={isoDate(current.published_at)}
      previous={neighbor(rows[index - 1])}
      next={neighbor(rows[index + 1])}
      changelog={{ blocks }}
    />,
    { headers: pageHeaders },
  );
}

export default createController(routes, {
  actions: {
    async assets(context) {
      return (await assets.fetch(context.request)) ?? new Response('Not Found', { status: 404 });
    },
    robots() {
      const body = ['User-agent: *', 'Allow: /', '', `Sitemap: ${origin}${routes.sitemap.href()}`, ''].join('\n');
      return document(body, 'text/plain', 86400);
    },
    async sitemap(context) {
      const rows = await readyVersions(context);
      const paths = [
        routes.index.href(),
        ...rows
          .slice(0, -1)
          .toReversed()
          .map((row) => routes.version.href({ version: row.version })),
      ];
      const body = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...paths.map((path) => `<url><loc>${origin}${path}</loc></url>`),
        '</urlset>',
      ].join('\n');
      return document(body, 'application/xml', 3600);
    },
    index(context) {
      return changelog(context);
    },
    version(context) {
      return changelog(context, context.params.version);
    },
    notFound,
  },
});
