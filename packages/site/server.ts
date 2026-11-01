import { execFile } from 'node:child_process';
import * as http from 'node:http';
import { createRequestListener } from 'remix/node-fetch-server';

import { router } from './app/router.ts';

const port = Number.parseInt(
  process.env.PORT ?? process.env.AWS_LAMBDA_HTTP_ENDPOINT?.split(':').at(-1) ?? '44100',
  10,
);
const hmrProxyPort = process.env.HMR_PROXY_PORT ? Number.parseInt(process.env.HMR_PROXY_PORT, 10) : null;
const isHmr = process.env.REMIX_NODE_HMR === '1';

const server = http.createServer(createRequestListener(router.fetch, { trustProxy: isHmr }));

server.listen(port, () => {
  if (isHmr) {
    import('remix/node-hmr/runtime').then((nodeHmr) => nodeHmr.emitServerReady());
  }

  const publicPort = hmrProxyPort ?? port;
  console.log(`Server listening on http://localhost:${publicPort}`);

  if (!process.env.AWS_LAMBDA_HTTP_ENDPOINT) {
    logTailscaleUrl(publicPort);
  }
});

function logTailscaleUrl(publicPort: number) {
  execFile('tailscale', ['status', '--json'], (error, stdout) => {
    if (error) {
      return;
    }

    const { BackendState, Self } = JSON.parse(stdout);
    const hostName = Self?.DNSName?.split('.')[0];

    if (BackendState === 'Running' && hostName) {
      console.log(`Tailscale: http://${hostName}:${publicPort}`);
    }
  });
}

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  server.close(() => process.exit(0));
  server.closeAllConnections();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
