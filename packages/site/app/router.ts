import { compression } from 'remix/middleware/compression';
import { render } from 'remix/middleware/render';
import { createRouter, type Middleware, type MiddlewareContext } from 'remix/router';
import controller from './actions/controller.tsx';
import { assets } from './assets.ts';
import { retryOnConflict } from './database/connection.ts';
import { Logger } from './logger.ts';
import { routes } from './routes.ts';

const renderMiddleware = render({ assets });
export type AppContext = MiddlewareContext<[typeof renderMiddleware]>;

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

const logContext: Middleware = (context, next) =>
  Logger.run({ method: context.request.method, path: context.url.pathname }, next);

export const router = createRouter<AppContext>({
  middleware: [logContext, compression(), edgeCache, renderMiddleware],
});
router.map(routes, controller);
const { fetch } = router;
router.fetch = (input, init) => retryOnConflict(() => fetch(input, init));
