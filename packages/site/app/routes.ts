import { get, route } from 'remix/routes';

export const routes = route({
  assets: get('/assets/*path'),
  changes: get('/changes/*version'),
  robots: get('/robots.txt'),
  sitemap: get('/sitemap.xml'),
  index: get('/(*version)'),
});
