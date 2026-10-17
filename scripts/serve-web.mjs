import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const root = join(process.cwd(), 'dist');
const port = Number(process.env.PORT ?? 43124);
const host = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function contentType(filePath) {
  return MIME[extname(filePath)] ?? 'application/octet-stream';
}

function insideRoot(filePath) {
  return filePath === root || filePath.startsWith(`${root}${sep}`);
}

const server = createServer(async (req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  try {
    const url = new URL(req.url ?? '/', `http://${host}:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) {
      pathname += 'index.html';
    }
    const requested = normalize(join(root, pathname));
    if (!insideRoot(requested)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let target = requested;
    try {
      const info = await stat(target);
      if (info.isDirectory()) {
        target = join(target, 'index.html');
      }
    } catch {
      target = join(root, 'index.html');
    }

    if (!insideRoot(target)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': contentType(target) });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Pocket Habit web export at http://${host}:${port}\n`);
});
