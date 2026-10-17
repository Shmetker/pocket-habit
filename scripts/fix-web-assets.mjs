import { Buffer } from 'node:buffer';
import { realpathSync } from 'node:fs';
import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CANONICAL_FROM = 'assets/node_modules/';
const CANONICAL_TO = 'assets/vendor/';

const BINARY_EXTENSIONS = new Set([
  '.wasm',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
]);

function posixRelative(root, filePath) {
  return relative(root, filePath).split(sep).join('/');
}

function vendorPrefix(prefix) {
  return prefix
    .split('/')
    .map((part) => (part === 'node_modules' ? 'vendor' : part))
    .join('/');
}

export async function findNodeModulesDirs(distDir) {
  const found = [];

  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const full = join(current, entry.name);
      if (entry.name === 'node_modules') {
        found.push(full);
      }
      await walk(full);
    }
  }

  await walk(distDir);
  return found;
}

export async function assertNoNodeModules(distDir) {
  const dirs = await findNodeModulesDirs(distDir);
  if (dirs.length === 0) {
    return;
  }
  const listed = dirs.map((dir) => posixRelative(distDir, dir)).join('\n');
  throw new Error(
    `dist still contains a node_modules directory, which Cloudflare Pages will not upload:\n${listed}`,
  );
}

function replacementsFor(distDir, dirs) {
  const pairs = dirs.map((dir) => {
    const from = `${posixRelative(distDir, dir)}/`;
    return { from, to: `${vendorPrefix(from.slice(0, -1))}/` };
  });
  if (!pairs.some((pair) => pair.from === CANONICAL_FROM)) {
    pairs.push({ from: CANONICAL_FROM, to: CANONICAL_TO });
  }
  pairs.sort((a, b) => b.from.length - a.from.length);
  return pairs;
}

function applyReplacements(buffer, pairs) {
  let current = buffer;
  for (const pair of pairs) {
    const from = Buffer.from(pair.from);
    const to = Buffer.from(pair.to);
    if (!current.includes(from)) {
      continue;
    }
    const parts = [];
    let cursor = 0;
    while (cursor < current.length) {
      const at = current.indexOf(from, cursor);
      if (at === -1) {
        parts.push(current.subarray(cursor));
        break;
      }
      parts.push(current.subarray(cursor, at));
      parts.push(to);
      cursor = at + from.length;
    }
    current = Buffer.concat(parts);
  }
  return current;
}

function looksBinary(filePath, buffer) {
  if (BINARY_EXTENSIONS.has(extname(filePath).toLowerCase())) {
    return true;
  }
  return buffer.subarray(0, 8192).includes(0);
}

async function walkFiles(dir, visit) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(full, visit);
      continue;
    }
    if (entry.isFile()) {
      await visit(full);
    }
  }
}

async function assertBinariesUntouched(distDir, pairs) {
  const hits = [];
  await walkFiles(distDir, async (filePath) => {
    const buffer = await readFile(filePath);
    if (!looksBinary(filePath, buffer)) {
      return;
    }
    const relativePath = posixRelative(distDir, filePath);
    for (const pair of pairs) {
      if (buffer.includes(Buffer.from(pair.from))) {
        hits.push(relativePath);
        break;
      }
    }
  });
  if (hits.length > 0) {
    throw new Error(
      `Refusing to rewrite binary files that contain ${CANONICAL_FROM}:\n${hits.join('\n')}`,
    );
  }
}

async function rewriteTextFiles(distDir, pairs) {
  let updated = 0;
  await walkFiles(distDir, async (filePath) => {
    const buffer = await readFile(filePath);
    if (looksBinary(filePath, buffer)) {
      return;
    }
    const next = applyReplacements(buffer, pairs);
    if (next.equals(buffer)) {
      return;
    }
    await writeFile(filePath, next);
    updated += 1;
  });
  return updated;
}

async function assertTextRewritten(distDir) {
  const needle = Buffer.from(CANONICAL_FROM);
  const hits = [];
  await walkFiles(distDir, async (filePath) => {
    const buffer = await readFile(filePath);
    if (looksBinary(filePath, buffer)) {
      return;
    }
    if (buffer.includes(needle)) {
      hits.push(posixRelative(distDir, filePath));
    }
  });
  if (hits.length > 0) {
    throw new Error(
      `dist still references ${CANONICAL_FROM} after the vendor rewrite:\n${hits.join('\n')}`,
    );
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function fixWebAssets(distDir) {
  let info;
  try {
    info = await stat(distDir);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`Web export directory not found: ${distDir}`);
    }
    throw error;
  }
  if (!info.isDirectory()) {
    throw new Error(`Web export directory not found: ${distDir}`);
  }

  const dirs = await findNodeModulesDirs(distDir);
  const pairs = replacementsFor(distDir, dirs);
  await assertBinariesUntouched(distDir, pairs);

  const planned = dirs
    .slice()
    .sort((a, b) => posixRelative(distDir, b).length - posixRelative(distDir, a).length)
    .map((dir) => ({ from: dir, to: join(dirname(dir), 'vendor') }));

  for (const step of planned) {
    if (await exists(step.to)) {
      throw new Error(`Cannot rename ${step.from} to ${step.to}: ${step.to} already exists`);
    }
  }
  for (const step of planned) {
    await rename(step.from, step.to);
  }

  const updated = await rewriteTextFiles(distDir, pairs);
  await assertNoNodeModules(distDir);
  await assertTextRewritten(distDir);
  return { renamed: planned.length, updated };
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  const entryUrl = pathToFileURL(realpathSync(resolve(entry))).href;
  const selfUrl = pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href;
  return entryUrl === selfUrl;
}

async function main() {
  const distDir = process.argv[2] ? resolve(process.argv[2]) : join(process.cwd(), 'dist');
  const result = await fixWebAssets(distDir);
  process.stdout.write(
    `Pages asset rewrite: renamed ${result.renamed} node_modules director${
      result.renamed === 1 ? 'y' : 'ies'
    } and updated ${result.updated} file${result.updated === 1 ? '' : 's'} under ${distDir}\n`,
  );
}

if (invokedDirectly()) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
