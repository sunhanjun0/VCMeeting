// Integration tests for same-origin static hosting (task 4.2).
// Boots the real express app with the content module, seeds a bundle via the
// content-store, then drives GET /content/:bundleId/* over HTTP.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import express from 'express';
import { createRoomManager } from '../../services/room-manager.js';
import { createContentStore } from '../../services/content-store.js';
import { createContentModule } from './index.js';
import { CSP } from './hosting.js';

async function makeServer() {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lp-host-'));
  const rooms = createRoomManager();
  const content = createContentStore({ dataDir, maxBytes: 1024 * 1024 });
  const app = express();
  createContentModule({ rooms, content, maxBytes: 1024 * 1024 }).init({ http: app });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cleanup = async () => {
    await new Promise((r) => server.close(r));
    await fsp.rm(dataDir, { recursive: true, force: true });
  };
  return { rooms, content, base, cleanup };
}

async function seedBundle(content) {
  return content.storeFiles(
    [
      { relativePath: 'index.html', buffer: Buffer.from('<h1>hello</h1>') },
      { relativePath: 'assets/app.js', buffer: Buffer.from('console.log(1)') },
      { relativePath: 'notes.txt', buffer: Buffer.from('plain') }
    ],
    { uploadedBy: 'host-sid' }
  );
}

test('serves index.html with CSP + nosniff headers', async () => {
  const s = await makeServer();
  try {
    const bundle = await seedBundle(s.content);
    const res = await fetch(`${s.base}/content/${bundle.id}/index.html`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '<h1>hello</h1>');
    assert.match(res.headers.get('content-type') || '', /text\/html/);
    assert.equal(res.headers.get('content-security-policy'), CSP);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  } finally {
    await s.cleanup();
  }
});

test('directory request resolves to index.html', async () => {
  const s = await makeServer();
  try {
    const bundle = await seedBundle(s.content);
    const res = await fetch(`${s.base}/content/${bundle.id}/`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '<h1>hello</h1>');
    assert.equal(res.headers.get('content-security-policy'), CSP);
  } finally {
    await s.cleanup();
  }
});

test('serves nested asset with correct MIME and no CSP (non-HTML)', async () => {
  const s = await makeServer();
  try {
    const bundle = await seedBundle(s.content);
    const res = await fetch(`${s.base}/content/${bundle.id}/assets/app.js`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'console.log(1)');
    assert.match(res.headers.get('content-type') || '', /javascript/);
    assert.equal(res.headers.get('content-security-policy'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  } finally {
    await s.cleanup();
  }
});

test('missing file → 404', async () => {
  const s = await makeServer();
  try {
    const bundle = await seedBundle(s.content);
    const res = await fetch(`${s.base}/content/${bundle.id}/nope.html`);
    assert.equal(res.status, 404);
  } finally {
    await s.cleanup();
  }
});

test('unknown bundle → 404', async () => {
  const s = await makeServer();
  try {
    const res = await fetch(`${s.base}/content/does-not-exist/index.html`);
    assert.equal(res.status, 404);
  } finally {
    await s.cleanup();
  }
});

test('path traversal via encoded ../ is blocked (not 200)', async () => {
  const s = await makeServer();
  try {
    const bundle = await seedBundle(s.content);
    // Encoded dots so fetch does not normalize them away before sending.
    const res = await fetch(`${s.base}/content/${bundle.id}/%2e%2e%2f%2e%2e%2fpackage.json`);
    assert.notEqual(res.status, 200);
    assert.ok(res.status === 403 || res.status === 404, `got ${res.status}`);
  } finally {
    await s.cleanup();
  }
});
