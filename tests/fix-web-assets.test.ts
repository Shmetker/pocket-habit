import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const root = join(__dirname, '..');
const script = join(root, 'scripts/fix-web-assets.mjs');
const wasmMagic = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

type Fixer = {
  fixWebAssets: (distDir: string) => Promise<{ renamed: number; updated: number }>;
  assertNoNodeModules: (distDir: string) => Promise<void>;
  findNodeModulesDirs: (distDir: string) => Promise<string[]>;
};

async function loadFixer(): Promise<Fixer> {
  const href = pathToFileURL(script).href;
  return import(href);
}

async function tempDist(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pocket-habit-assets-'));
}

test('assertNoNodeModules fails while a node_modules directory remains', async () => {
  const dir = await tempDist();
  try {
    await mkdir(join(dir, 'assets', 'node_modules', 'expo-sqlite'), { recursive: true });
    const { assertNoNodeModules, findNodeModulesDirs } = await loadFixer();
    const found = await findNodeModulesDirs(dir);
    assert.equal(found.length, 1);
    await assert.rejects(() => assertNoNodeModules(dir), /node_modules/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fixWebAssets renames node_modules to vendor and rewrites asset URLs', async () => {
  const dir = await tempDist();
  const wasmPath = join(
    dir,
    'assets/node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.wasm',
  );
  const nestedPath = join(dir, 'assets/node_modules/pkg/node_modules/inner/file.txt');
  const fontPath = join(
    dir,
    'assets/node_modules/@expo-google-fonts/plus-jakarta-sans/font.ttf',
  );
  const workerPath = join(dir, '_expo/static/js/web/worker.js');
  const mapPath = join(dir, '_expo/static/js/web/worker.js.map');
  const headers = 'Cross-Origin-Opener-Policy: same-origin\n';
  const worker = [
    'const keep = "node_modules/react/index.js";',
    'm.exports = "/assets/node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.wasm";',
    'm.exports = "/assets/node_modules/pkg/node_modules/inner/file.txt";',
    '',
  ].join('\n');

  try {
    await mkdir(join(dir, 'assets/node_modules/expo-sqlite/web/wa-sqlite'), { recursive: true });
    await mkdir(join(dir, 'assets/node_modules/pkg/node_modules/inner'), { recursive: true });
    await mkdir(join(dir, 'assets/node_modules/@expo-google-fonts/plus-jakarta-sans'), {
      recursive: true,
    });
    await mkdir(join(dir, '_expo/static/js/web'), { recursive: true });
    await writeFile(wasmPath, wasmMagic);
    await writeFile(fontPath, Buffer.from('font-bytes'));
    await writeFile(nestedPath, 'assets/node_modules/pkg/node_modules/inner/file.txt\n');
    await writeFile(workerPath, worker);
    await writeFile(mapPath, JSON.stringify({ file: worker }));
    await writeFile(join(dir, '_headers'), headers);

    const { fixWebAssets, assertNoNodeModules, findNodeModulesDirs } = await loadFixer();
    const result = await fixWebAssets(dir);
    assert.equal(result.renamed, 2);
    assert.ok(result.updated >= 2);

    assert.deepEqual(await findNodeModulesDirs(dir), []);
    await assertNoNodeModules(dir);

    const movedWasm = await readFile(
      join(dir, 'assets/vendor/expo-sqlite/web/wa-sqlite/wa-sqlite.wasm'),
    );
    assert.deepEqual(movedWasm, wasmMagic);
    const movedFont = await readFile(
      join(dir, 'assets/vendor/@expo-google-fonts/plus-jakarta-sans/font.ttf'),
    );
    assert.equal(movedFont.toString(), 'font-bytes');
    assert.equal(
      await readFile(join(dir, 'assets/vendor/pkg/vendor/inner/file.txt'), 'utf8'),
      'assets/vendor/pkg/vendor/inner/file.txt\n',
    );

    const rewritten = await readFile(workerPath, 'utf8');
    assert.equal(rewritten.includes('assets/node_modules/'), false);
    assert.match(rewritten, /\/assets\/vendor\/expo-sqlite\/web\/wa-sqlite\/wa-sqlite\.wasm/);
    assert.match(rewritten, /\/assets\/vendor\/pkg\/vendor\/inner\/file\.txt/);
    assert.match(rewritten, /node_modules\/react\/index\.js/);
    const map = await readFile(mapPath, 'utf8');
    assert.equal(map.includes('assets/node_modules/'), false);
    assert.match(map, /assets\/vendor\/expo-sqlite/);
    assert.equal(await readFile(join(dir, '_headers'), 'utf8'), headers);

    const again = await fixWebAssets(dir);
    assert.equal(again.renamed, 0);
    assert.equal(again.updated, 0);
    assert.deepEqual(await readFile(workerPath, 'utf8'), rewritten);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fixWebAssets refuses to replace an existing vendor directory', async () => {
  const dir = await tempDist();
  try {
    await mkdir(join(dir, 'assets/vendor'), { recursive: true });
    await mkdir(join(dir, 'assets/node_modules/expo-sqlite'), { recursive: true });
    await writeFile(join(dir, 'assets/node_modules/expo-sqlite/wa-sqlite.wasm'), wasmMagic);
    const { fixWebAssets, findNodeModulesDirs } = await loadFixer();
    await assert.rejects(() => fixWebAssets(dir), /already exists/);
    assert.equal((await findNodeModulesDirs(dir)).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fixWebAssets refuses to rewrite a binary that contains the asset prefix', async () => {
  const dir = await tempDist();
  try {
    await mkdir(join(dir, 'assets/node_modules/expo-sqlite'), { recursive: true });
    await writeFile(
      join(dir, 'assets/node_modules/expo-sqlite/wa-sqlite.wasm'),
      Buffer.concat([wasmMagic, Buffer.from('assets/node_modules/expo-sqlite/wa-sqlite.wasm')]),
    );
    const { fixWebAssets, findNodeModulesDirs } = await loadFixer();
    await assert.rejects(() => fixWebAssets(dir), /binary/);
    assert.equal((await findNodeModulesDirs(dir)).length, 1);
    const bytes = await readFile(join(dir, 'assets/node_modules/expo-sqlite/wa-sqlite.wasm'));
    assert.equal(bytes.includes(Buffer.from('assets/node_modules/')), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('cli fails when the export directory is missing and succeeds on a fixture', async () => {
  const dir = await tempDist();
  try {
    const missing = spawnSync(process.execPath, [script, join(dir, 'missing')], {
      encoding: 'utf8',
    });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /not found/);

    await mkdir(join(dir, 'assets/node_modules/expo-sqlite'), { recursive: true });
    await writeFile(join(dir, 'assets/node_modules/expo-sqlite/wa-sqlite.wasm'), wasmMagic);
    await writeFile(
      join(dir, 'app.js'),
      'export const wasm = "/assets/node_modules/expo-sqlite/wa-sqlite.wasm";\n',
    );
    const ok = spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /renamed 1 node_modules directory/);
    const rewritten = await readFile(join(dir, 'app.js'), 'utf8');
    assert.match(rewritten, /\/assets\/vendor\/expo-sqlite\/wa-sqlite\.wasm/);
    assert.deepEqual(
      await readFile(join(dir, 'assets/vendor/expo-sqlite/wa-sqlite.wasm')),
      wasmMagic,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('build:web exports the site, copies _headers, and rewrites asset paths', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const build = pkg.scripts['build:web'];
  assert.match(build, /expo export -p web/);
  assert.match(build, /public\/_headers dist\/_headers/);
  assert.match(build, /node scripts\/fix-web-assets\.mjs/);
  assert.equal(pkg.scripts['export:web'], 'npm run build:web');
});
