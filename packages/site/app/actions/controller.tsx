import { createCookie } from 'remix/cookie';
import { createController } from 'remix/router';

import { assets } from '#app/assets.ts';
import type { Diff } from '#app/data/comparison.ts';
import { authorizeUrl, noStore, receiveEvent, saveInstallation } from '#app/data/slack.ts';
import { ResourceChangesTable } from '#app/database/resource-changes.ts';
import { ResourceTypesTable } from '#app/database/resource-types.ts';
import { type Version, VersionsTable } from '#app/database/versions.ts';
import { Logger } from '#app/logger.ts';
import type { AppContext } from '#app/router.ts';
import { routes } from '#app/routes.ts';
import { SlackWebApi } from '#app/slack/web-api.ts';
import { render } from '#app/ui/pages/changelog/lines.ts';
import { ChangelogPage } from '#app/ui/pages/changelog/page.tsx';
import type { Neighbor } from '#app/ui/pages/changelog/public/navigation.tsx';
import { origin } from '#app/ui/pages/lib/document.tsx';
import { NotFoundPage } from '#app/ui/pages/not-found/page.tsx';
import { NotifyPage, type SlackOutcome, slackOutcomes } from '#app/ui/pages/notify/page.tsx';
import { type ResourceSummary, ResourcesPage } from '#app/ui/pages/resources/page.tsx';

const document = (body: string, type: string, maxAge: number) =>
  new Response(body, {
    headers: { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': `public, max-age=0, s-maxage=${maxAge}` },
  });

const stateCookie = createCookie('slack_oauth_state', {
  path: routes.slackCallback.href(),
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
  maxAge: 600,
});

async function installSlack(context: AppContext): Promise<SlackOutcome> {
  const { searchParams } = context.url;
  const expected = await stateCookie.parse(context.request.headers.get('Cookie'));
  const code = searchParams.get('code');
  if (searchParams.get('error')) return 'denied';
  if (!expected || expected !== searchParams.get('state') || !code) return 'invalid';
  try {
    await saveInstallation(await SlackWebApi.exchangeCode(code));
    return 'installed';
  } catch (error) {
    Logger.error('slack installation failed', { error });
    return 'failed';
  }
}

async function slackCallback(context: AppContext) {
  return new Response(null, {
    status: 303,
    headers: {
      ...noStore,
      Location: `${routes.notify.href()}?slack=${await installSlack(context)}`,
      'Set-Cookie': await stateCookie.serialize('', { maxAge: 0 }),
    },
  });
}

const pageHeaders = { 'Cache-Control': 'public, max-age=0, s-maxage=300' };

const notFound = (context: AppContext) =>
  context.render(<NotFoundPage path={context.url.pathname} />, { status: 404, headers: pageHeaders });

const isoDate = (value: unknown) => (value ? new Date(value as string | Date).toISOString().slice(0, 10) : undefined);

const neighbor = (row?: Version): Neighbor | undefined =>
  row && { version: row.version, date: isoDate(row.published_at) };

async function resourceSummaries() {
  const rows = await ResourceTypesTable.list();
  return rows
    .map(
      (row): ResourceSummary => ({
        type: row.resource_type,
        status: row.latest_status,
        version: row.latest_version,
      }),
    )
    .sort((a, b) => a.type.localeCompare(b.type));
}

async function resourceVersions(resourceType: string) {
  const ordinals = new Set(await ResourceChangesTable.listOrdinals(resourceType));
  return (await VersionsTable.listReady()).filter((row) => ordinals.has(row.ordinal));
}

async function changelog(context: AppContext, rows: Version[], path?: string, resourceType?: string) {
  const index = path ? rows.findIndex((row) => row.version === path) : rows.length - 1;
  const current = rows[index];
  if (!current) return notFound(context);
  const changes = await ResourceChangesTable.listByOrdinal(current.ordinal, resourceType);
  const blocks = changes
    .map((change) => render(JSON.parse(change.diff) as Diff))
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
    async sitemap() {
      const rows = await VersionsTable.listReady();
      const resources = await resourceSummaries();
      const paths = [
        routes.index.href(),
        routes.resources.href(),
        routes.notify.href(),
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
      return changelog(context, await VersionsTable.listReady());
    },
    async version(context) {
      return changelog(context, await VersionsTable.listReady(), context.params.version);
    },
    async resources(context) {
      return context.render(<ResourcesPage resources={await resourceSummaries()} />, { headers: pageHeaders });
    },
    async resource(context) {
      const { type, version } = context.params;
      return changelog(context, await resourceVersions(type), version, type);
    },
    async slackInstall() {
      const state = crypto.randomUUID();
      return new Response(null, {
        status: 302,
        headers: { ...noStore, Location: authorizeUrl(state), 'Set-Cookie': await stateCookie.serialize(state) },
      });
    },
    notify(context) {
      const slack = slackOutcomes.find((outcome) => outcome === context.url.searchParams.get('slack'));
      return context.render(<NotifyPage slack={slack} />, { headers: pageHeaders });
    },
    slackCallback,
    slackEvents: (context) => receiveEvent(context.request),
    notFound,
  },
});
