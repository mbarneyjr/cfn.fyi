import { createController } from 'remix/router';

import { assets } from '#app/assets.ts';
import type { Block, Status } from '#app/data/comparison.ts';
import { resourceChanges, resourceTypes, type Version, versions } from '#app/data/tables.ts';
import type { AppContext } from '#app/router.ts';
import { routes } from '#app/routes.ts';
import { ChangelogPage } from '#app/ui/pages/changelog/page.tsx';
import type { Neighbor } from '#app/ui/pages/changelog/public/navigation.tsx';
import { origin } from '#app/ui/pages/lib/document.tsx';
import { NotFoundPage } from '#app/ui/pages/not-found/page.tsx';
import { type ResourceSummary, ResourcesPage } from '#app/ui/pages/resources/page.tsx';

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

async function resourceSummaries(context: AppContext) {
  const rows = await context.db.query(resourceTypes).all();
  return rows
    .map(
      (row): ResourceSummary => ({
        type: row.resource_type,
        status: row.latest_status as Status,
        version: row.latest_version,
      }),
    )
    .sort((a, b) => a.type.localeCompare(b.type));
}

async function resourceVersions(context: AppContext, resourceType: string) {
  const changes = await context.db
    .query(resourceChanges)
    .where({ resource_type: resourceType })
    .select({ ordinal: resourceChanges.ordinal })
    .all();
  const ordinals = new Set(changes.map((change) => change.ordinal));
  return (await readyVersions(context)).filter((row) => ordinals.has(row.ordinal));
}

async function changelog(context: AppContext, rows: Version[], path?: string, resourceType?: string) {
  const index = path ? rows.findIndex((row) => row.version === path) : rows.length - 1;
  const current = rows[index];
  if (!current) return notFound(context);
  const changes = await context.db
    .query(resourceChanges)
    .where({ ordinal: current.ordinal, ...(resourceType && { resource_type: resourceType }) })
    .all();
  const blocks = changes
    .map((change) => JSON.parse(change.block) as Block)
    .sort((a, b) => a.name.localeCompare(b.name));
  return context.render(
    <ChangelogPage
      home={!path}
      resourceType={resourceType}
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
      const resources = await resourceSummaries(context);
      const paths = [
        routes.index.href(),
        routes.resources.href(),
        ...resources.map((resource) => routes.resource.href({ type: resource.type })),
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
    async index(context) {
      return changelog(context, await readyVersions(context));
    },
    async version(context) {
      return changelog(context, await readyVersions(context), context.params.version);
    },
    async resources(context) {
      return context.render(<ResourcesPage resources={await resourceSummaries(context)} />, { headers: pageHeaders });
    },
    async resource(context) {
      const { type, version } = context.params;
      return changelog(context, await resourceVersions(context, type), version, type);
    },
    notFound,
  },
});
