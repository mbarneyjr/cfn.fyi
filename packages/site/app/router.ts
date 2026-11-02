import type { Database } from 'remix/data-table';
import { createPostgresDatabase } from 'remix/data-table/postgres';
import { compression } from 'remix/middleware/compression';
import { render } from 'remix/middleware/render';
import { createContextKey, createRouter, type Middleware, type MiddlewareContext } from 'remix/router';
import controller from './actions/controller.tsx';
import { assets } from './assets.ts';
import { createPool } from './data/database.ts';
import { routes } from './routes.ts';

const databaseContext = createContextKey<Database>();

const loadDatabase =
  (db: Database): Middleware<{ key: typeof databaseContext; value: Database; property: 'db' }> =>
  (context, next) => {
    context.set(databaseContext, db, { property: 'db' });
    return next();
  };

const renderMiddleware = render({ assets });
export type AppContext = MiddlewareContext<[ReturnType<typeof loadDatabase>, typeof renderMiddleware]>;

declare module 'remix' {
  interface RouterTypes {
    context: AppContext;
  }
}

const edgeCache: Middleware = async (_context, next) => {
  const response = await next();
  if (response.ok && !response.headers.has('Cache-Control')) {
    response.headers.set('Cache-Control', 'public, max-age=0, s-maxage=31536000');
  }
  return response;
};

export function createAppRouter({ db }: { db: Database }) {
  const router = createRouter<AppContext>({
    middleware: [compression(), edgeCache, loadDatabase(db), renderMiddleware],
  });
  router.map(routes, controller);
  return router;
}

export const router = createAppRouter({ db: createPostgresDatabase(createPool()) });
