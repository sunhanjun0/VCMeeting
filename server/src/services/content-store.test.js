import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import yazl from 'yazl';
import {
  createContentStore,
  safeResolveWithin,
  isAllowedFile,
  ContentError
} from './content-store.js';

async function tmpStore(opts = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'livepage-cs-'));
  return { store: createContentStore({ dataDir: dir, ...opts }), dataDir: dir };
}

function buildZip(entries) {
  return new Promise((resolve) => {
    const zip = new yazl.ZipFile();
    for (const e of entries) {
      zip.addBuffer(Buffer.from(e.content), e.name, e.mode ? { mode: e.mode } : {});
    }
    zip.end();
    const chunks = [];
    zip.outputStream.on('data', (c) => chunks.push(c));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// --- pure guards ---

test('isAllowedFile: whitelist', () => {
  assert.equal(isAllowedFile('index.html'), true);
  assert.equal(isAllowedFile('a/b/style.css'), true);
  assert.equal(isAllowedFile('font.woff2'), true);
  assert.equal(isAllowedFile('evil.exe'), false);
  assert.equal(isAllowedFile('shell.sh'), false);
  assert.equal(isAllowedFile('noext'), false);
});

test('safeResolveWithin: blocks traversal / absolute / drive', () => {
  const base = '/srv/bundles/b1';
  assert.ok(safeResolveWithin(base, 'a/b/index.html').startsWith(base));
  assert.throws(() => safeResolveWithin(base, '../evil.html'), /zip_slip|Illegal/);
  assert.throws(() => safeResolveWithin(base, 'a/../../evil.html'), /Illegal/);
  assert.throws(() => safeResolveWithin(base, '/etc/passwd'), /Illegal/);
  assert.throws(() => safeResolveWithin(base, 'C:\\win\\x.html'), /Illegal/);
  assert.throws(() => safeResolveWithin(base, ''), /Illegal/);
});

// --- storeFiles ---

test('storeFiles: writes files and identifies index.html entry', async () => {
  const { store, dataDir } = await tmpStore();
  const meta = await store.storeFiles([
    { relativePath: 'index.html', buffer: Buffer.from('<h1>hi</h1>') },
    { relativePath: 'assets/app.js', buffer: Buffer.from('console.log(1)') }
  ], { uploadedBy: 's1' });

  assert.equal(meta.entryFile, 'index.html');
  assert.equal(meta.needsEntry, false);
  assert.equal(meta.uploadedBy, 's1');
  const entryPath = path.join(store.bundleDir(meta.id), 'index.html');
  assert.ok(fs.existsSync(entryPath));
  await fsp.rm(dataDir, { recursive: true, force: true });
});

test('storeFiles: rejects disallowed extension and cleans up', async () => {
  const { store, dataDir } = await tmpStore();
  await assert.rejects(
    store.storeFiles([{ relativePath: 'evil.exe', buffer: Buffer.from('x') }]),
    (e) => e instanceof ContentError && e.code === 'bad_type'
  );
  assert.equal(fs.existsSync(store.bundlesRoot) && fs.readdirSync(store.bundlesRoot).length, 0);
  await fsp.rm(dataDir, { recursive: true, force: true });
});

test('storeFiles: rejects zip-slip relative path', async () => {
  const { store, dataDir } = await tmpStore();
  await assert.rejects(
    store.storeFiles([{ relativePath: '../escape.html', buffer: Buffer.from('x') }]),
    (e) => e.code === 'zip_slip'
  );
  await fsp.rm(dataDir, { recursive: true, force: true });
});

test('storeFiles: enforces size cap', async () => {
  const { store, dataDir } = await tmpStore({ maxBytes: 10 });
  await assert.rejects(
    store.storeFiles([{ relativePath: 'index.html', buffer: Buffer.alloc(20) }]),
    (e) => e.code === 'too_large'
  );
  await fsp.rm(dataDir, { recursive: true, force: true });
});

test('storeFiles: needsEntry when no index.html and multiple html', async () => {
  const { store, dataDir } = await tmpStore();
  const meta = await store.storeFiles([
    { relativePath: 'a.html', buffer: Buffer.from('a') },
    { relativePath: 'b.html', buffer: Buffer.from('b') }
  ]);
  assert.equal(meta.entryFile, null);
  assert.equal(meta.needsEntry, true);
  assert.deepEqual(meta.candidates.sort(), ['a.html', 'b.html']);
  await fsp.rm(dataDir, { recursive: true, force: true });
});

// --- storeZip ---

test('storeZip: extracts and identifies entry', async () => {
  const { store, dataDir } = await tmpStore();
  const zip = await buildZip([
    { name: 'index.html', content: '<h1>hi</h1>' },
    { name: 'css/style.css', content: 'body{}' }
  ]);
  const meta = await store.storeZip(zip, { uploadedBy: 's1' });
  assert.equal(meta.entryFile, 'index.html');
  assert.ok(fs.existsSync(path.join(store.bundleDir(meta.id), 'css/style.css')));
  await fsp.rm(dataDir, { recursive: true, force: true });
});

test('storeZip: rejects disallowed extension and cleans up', async () => {
  const { store, dataDir } = await tmpStore();
  const zip = await buildZip([{ name: 'malware.exe', content: 'MZ' }]);
  await assert.rejects(store.storeZip(zip), (e) => e.code === 'bad_type');
  assert.equal(fs.readdirSync(store.bundlesRoot).length, 0);
  await fsp.rm(dataDir, { recursive: true, force: true });
});

test('storeZip: rejects symlink entries', async () => {
  const { store, dataDir } = await tmpStore();
  const zip = await buildZip([
    { name: 'index.html', content: 'ok' },
    { name: 'link.html', content: '/etc/passwd', mode: 0o120777 } // symlink mode
  ]);
  await assert.rejects(store.storeZip(zip), (e) => e.code === 'symlink');
  await fsp.rm(dataDir, { recursive: true, force: true });
});

test('storeZip: enforces decompressed size cap (zip-bomb guard)', async () => {
  const { store, dataDir } = await tmpStore({ maxBytes: 100 });
  const zip = await buildZip([{ name: 'big.html', content: 'A'.repeat(500) }]);
  await assert.rejects(store.storeZip(zip), (e) => e.code === 'too_large');
  assert.equal(fs.readdirSync(store.bundlesRoot).length, 0);
  await fsp.rm(dataDir, { recursive: true, force: true });
});

test('deleteBundle removes the directory', async () => {
  const { store, dataDir } = await tmpStore();
  const meta = await store.storeFiles([{ relativePath: 'index.html', buffer: Buffer.from('x') }]);
  assert.ok(fs.existsSync(store.bundleDir(meta.id)));
  await store.deleteBundle(meta.id);
  assert.equal(fs.existsSync(store.bundleDir(meta.id)), false);
  await fsp.rm(dataDir, { recursive: true, force: true });
});
