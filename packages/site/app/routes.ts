import { get, post, route } from 'remix/routes';

export const routes = route({
  assets: get('/assets/*path'),
  robots: get('/robots.txt'),
  sitemap: get('/sitemap.xml'),
  version: get('/version/*version'),
  resources: get('/resources'),
  resource: get('/resources/:type(/*version)'),
  notify: get('/notify'),
  slackInstall: get('/slack/install'),
  slackCallback: get('/slack/oauth/callback'),
  slackEvents: post('/slack/events'),
  index: get('/'),
  notFound: get('/*path'),
});
