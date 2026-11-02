import { get, route } from 'remix/routes';

export const routes = route({
  assets: get('/assets/*path'),
  robots: get('/robots.txt'),
  sitemap: get('/sitemap.xml'),
  version: get('/version/*version'),
  resources: get('/resources'),
  resource: get('/resources/:type(/*version)'),
  index: get('/'),
  notFound: get('/*path'),
});
