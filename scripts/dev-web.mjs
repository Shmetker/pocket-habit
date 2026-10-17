import { spawn } from 'node:child_process';
import http from 'node:http';

const listenHost = '127.0.0.1';
const listenPort = Number(process.env.PORT ?? 43123);
const upstreamPort = Number(process.env.EXPO_UPSTREAM_PORT ?? 43125);

function injectIsolation(headers) {
  return {
    ...headers,
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
  };
}

function startExpo() {
  const child = spawn(
    'npx',
    ['expo', 'start', '--web', '--port', String(upstreamPort), '--host', 'localhost'],
    {
      stdio: 'inherit',
      env: { ...process.env, CI: process.env.CI ?? '1' },
    },
  );
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
  return child;
}

function probe(host) {
  return new Promise((resolve) => {
    const req = http.request(
      { host, port: upstreamPort, path: '/', method: 'GET', timeout: 1500 },
      (res) => {
        res.resume();
        resolve(true);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function waitForUpstream() {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    if (await probe('::1')) {
      return '::1';
    }
    if (await probe('127.0.0.1')) {
      return '127.0.0.1';
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error('Expo web dev server did not start');
}

function startProxy(upstreamHost) {
  const server = http.createServer((req, res) => {
    const proxyReq = http.request(
      {
        host: upstreamHost,
        port: upstreamPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, injectIsolation(proxyRes.headers));
        proxyRes.pipe(res);
      },
    );
    proxyReq.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502);
      }
      res.end('Expo dev server is not reachable');
    });
    req.pipe(proxyReq);
  });

  server.listen(listenPort, listenHost, () => {
    process.stdout.write(
      `Pocket Habit dev server at http://${listenHost}:${listenPort} (COOP/COEP injected)\n`,
    );
  });
}

startExpo();
const upstreamHost = await waitForUpstream();
startProxy(upstreamHost);
