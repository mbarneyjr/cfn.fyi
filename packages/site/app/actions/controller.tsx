import { redirect } from 'remix/response/redirect';
import { createController } from 'remix/router';

import { assets } from '#app/assets.ts';
import { routes } from '#app/routes.ts';
import { ChangelogChanges } from '#app/ui/pages/changelog/changes.tsx';
import { compare } from '#app/ui/pages/changelog/comparison.ts';
import { ChangelogPage } from '#app/ui/pages/changelog/page.tsx';
import { listCfnVersions, neighbor, specification } from '#app/ui/pages/changelog/specification.ts';
import { NotFoundPage } from '#app/ui/pages/not-found/page.tsx';

export default createController(routes, {
  actions: {
    async assets(context) {
      return (await assets.fetch(context.request)) ?? new Response('Not Found', { status: 404 });
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
        return context.render(<ChangelogChanges changelog={compare(before, after)} />);
      } catch (error) {
        console.error(`changes ${version} failed`, error);
        return context.render(<ChangelogChanges error={`The specification for ${version} did not download.`} />, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
    },
  },
});
