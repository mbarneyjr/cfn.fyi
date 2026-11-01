import { get, route } from 'remix/routes';

export const routes = route({
  assets: get('/assets/*path'),
  changes: get('/changes/*version'),
  index: get('/(*version)'),
});
