import { redirect } from 'remix/response/redirect';
import { createController } from 'remix/router';

import { assets } from '#app/assets.ts';
import { routes } from '#app/routes.ts';
import { ChangelogChanges } from '#app/ui/pages/changelog/changes.tsx';
import { compare } from '#app/ui/pages/changelog/comparison.ts';
import { ChangelogPage } from '#app/ui/pages/changelog/page.tsx';
import { listCfnVersions, neighbor, specification } from '#app/ui/pages/changelog/specification.ts';
import { origin } from '#app/ui/pages/lib/document.tsx';
import { NotFoundPage } from '#app/ui/pages/not-found/page.tsx';

const noindex = { 'X-Robots-Tag': 'noindex' };

const document = (body: string, type: string, maxAge: number) =>
  new Response(body, {
    headers: { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': `public, max-age=0, s-maxage=${maxAge}` },
  });

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
      const versions = await listCfnVersions();
      const paths = [
        routes.index.href(),
        ...versions
          .slice(0, -1)
          .toReversed()
          .map((version) => routes.index.href({ version })),
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
      const headers = { 'Cache-Control': 'public, max-age=0, s-maxage=300' };
      const query = context.url.searchParams.get('version');
      if (query) return redirect(routes.index.href({ version: query }), { status: 301, headers });
      const versions = await listCfnVersions();
      const version = context.params.version ?? (versions.at(-1) as string);
      if (!versions.includes(version)) {
        return context.render(<NotFoundPage path={context.url.pathname} />, { status: 404, headers });
      }
      const index = versions.indexOf(version);
      const [previous, current, next] = await Promise.all(
        [versions[index - 1], version, versions[index + 1]].map(neighbor),
      );
      return context.render(
        <ChangelogPage
          home={!context.params.version}
          versions={versions}
          version={version}
          date={current?.date}
          previous={previous}
          next={next}
        />,
        { headers },
      );
    },
    async changes(context) {
      const { version } = context.params;
      try {
        const versions = await listCfnVersions();
        const index = versions.indexOf(version);
        if (index < 0) return new Response('Not Found', { status: 404 });
        const previous = versions[index - 1];
        const [before, after] = await Promise.all([
          previous ? specification(previous) : undefined,
          specification(version),
        ]);
        return context.render(<ChangelogChanges changelog={compare(before, after)} />, { headers: noindex });
      } catch (error) {
        console.error(`changes ${version} failed`, error);
        return context.render(<ChangelogChanges error={`The specification for ${version} did not download.`} />, {
          headers: { ...noindex, 'Cache-Control': 'no-store' },
        });
      }
    },
  },
});
