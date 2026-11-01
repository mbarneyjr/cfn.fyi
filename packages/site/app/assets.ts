import { fileURLToPath } from 'node:url';
import { createAssetServer } from 'remix/assets';
import { componentHmr } from 'remix/component-hmr/assets';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const nodeEnv = process.env.NODE_ENV ?? 'development';
const isDevelopment = nodeEnv === 'development';
const isHmr = Boolean(isDevelopment && process.env.REMIX_NODE_HMR);

export const assets = createAssetServer({
  basePath: '/assets',
  mounts: { app: 'app', npm: '../../node_modules' },
  rootDir,
  allowFiles: ['app/routes.ts', 'app/**/public/**'],
  allowPackages: ['remix'],
  denyFiles: ['app/**/*.test.*'],
  sourceMaps: isDevelopment ? 'external' : undefined,
  minify: !isDevelopment,
  fingerprint: !isDevelopment,
  watch: isDevelopment,
  hmr: isHmr
    ? {
        channel: async () => (await import('remix/node-hmr/runtime')).createBrowserHmrChannel(),
        moduleImporter: 'remix/multiple-import-maps-polyfill',
      }
    : undefined,
  scripts: { loaders: isHmr ? [componentHmr()] : undefined },
  files: {
    extensions: ['.svg', '.png', '.woff2'],
  },
});
