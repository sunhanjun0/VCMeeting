// Integration tests for the content upload endpoint (task 4.1).
// Spins up the real express app with the content module wired to a real
// room-manager + content-store (temp dir), and drives it over HTTP using
// Node's built-in fetch/FormData/Blob.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import express from 'express';
import { createRoomManager } from '../../services/room-manager.js';
import { createContentStore } from '../../services/content-store.js';
import { createContentModule } from './index.js';

const MAX_BYTES = 1024 * 1024; // 1MB for tests

async function makeServer() {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lp-content-'));
  const rooms = createRoomManager();
  const content = createContentStore({ dataDir, maxBytes: MAX_BYTES });
  const app = express();
  createContentModule({ rooms, content, maxBytes: MAX_BYTES }).init({ http: app });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cleanup = async () => {
    await new Promise((r) => server.close(r));
    await fsp.rm(dataDir, { recursive: true, force: true });
  };
  return { rooms, content, dataDir, base, cleanup };
}

function newRoom(rooms, hostSessionId = 'host-sid') {
  return rooms.createRoom({ passwordHash: 'x', hostSessionId, hostName: 'Host' });
}

// FormData helper: entries = [{ path, body, type }]. Relative paths ride in a
// parallel `paths` JSON field (multer strips dirs from the multipart filename).
function form(entries) {
  const fd = new FormData();
  fd.append('paths', JSON.stringify(entries.map((e) => e.path)));
  for (const e of entries) {
    fd.append('files', new Blob([e.body], { type: e.type || 'application/octet-stream' }), e.path);
  }
  return fd;
}

async function upload(base, roomId, { sessionId, entries }) {
  const headers = {};
  if (sessionId !== undefined) headers['x-session-id'] = sessionId;
  return fetch(`${base}/api/rooms/${roomId}/content`, {
    method: 'POST',
    headers,
    body: form(entries || [])
  });
}

test('host uploads a single index.html → 201 + bundle', async () => {
  const s = await makeServer();
  try {
    const room = newRoom(s.rooms);
    const res = await upload(s.base, room.id, {
      sessionId: 'host-sid',
      entries: [{ path: 'index.html', body: '<h1>hi</h1>', type: 'text/html' }]
    });
    assert.equal(res.status, 201);
    const { bundle } = await res.json();
    assert.equal(bundle.entryFile, 'index.html');
    assert.equal(bundle.needsEntry, false);
    assert.ok(bundle.id);
    assert.equal(bundle.uploadedBy, 'host-sid');
    // File actually landed on disk.
    assert.ok(fs.existsSync(path.join(s.content.bundleDir(bundle.id), 'index.html')));
  } finally {
    await s.cleanup();
  }
});

test('multi-file upload preserves relative directory structure', async () => {
  const s = await makeServer();
  try {
    const room = newRoom(s.rooms);
    const res = await upload(s.base, room.id, {
      sessionId: 'host-sid',
      entries: [
        { path: 'index.html', body: '<script src="assets/app.js"></script>', type: 'text/html' },
        { path: 'assets/app.js', body: 'console.log(1)', type: 'text/javascript' }
      ]
    });
    assert.equal(res.status, 201);
    const { bundle } = await res.json();
    assert.equal(bundle.entryFile, 'index.html');
    const dir = s.content.bundleDir(bundle.id);
    assert.ok(fs.existsSync(path.join(dir, 'index.html')));
    assert.ok(fs.existsSync(path.join(dir, 'assets', 'app.js')));
  } finally {
    await s.cleanup();
  }
});

test('missing session header → 403', async () => {
  const s = await makeServer();
  try {
    const room = newRoom(s.rooms);
    const res = await upload(s.base, room.id, {
      entries: [{ path: 'index.html', body: 'x', type: 'text/html' }]
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'forbidden');
  } finally {
    await s.cleanup();
  }
});

test('non-host session → 403', async () => {
  const s = await makeServer();
  try {
    const room = newRoom(s.rooms);
    const res = await upload(s.base, room.id, {
      sessionId: 'not-the-host',
      entries: [{ path: 'index.html', body: 'x', type: 'text/html' }]
    });
    assert.equal(res.status, 403);
  } finally {
    await s.cleanup();
  }
});

test('unknown room → 404', async () => {
  const s = await makeServer();
  try {
    const res = await upload(s.base, 'no-such-room', {
      sessionId: 'host-sid',
      entries: [{ path: 'index.html', body: 'x', type: 'text/html' }]
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 'room_not_found');
  } finally {
    await s.cleanup();
  }
});

test('disallowed file type → 400 bad_type', async () => {
  const s = await makeServer();
  try {
    const room = newRoom(s.rooms);
    const res = await upload(s.base, room.id, {
      sessionId: 'host-sid',
      entries: [{ path: 'evil.exe', body: 'MZ', type: 'application/octet-stream' }]
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'bad_type');
  } finally {
    await s.cleanup();
  }
});

test('empty upload (no files) → 400 empty', async () => {
  const s = await makeServer();
  try {
    const room = newRoom(s.rooms);
    const res = await upload(s.base, room.id, { sessionId: 'host-sid', entries: [] });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'empty');
  } finally {
    await s.cleanup();
  }
});

test('frozen room (host offline) rejects upload with 403', async () => {
  const s = await makeServer();
  try {
    const room = newRoom(s.rooms);
    // Host disconnects → room freezes (hostSessionId=null).
    s.rooms.setConnected(room.id, 'host-sid', false);
    const res = await upload(s.base, room.id, {
      sessionId: 'host-sid',
      entries: [{ path: 'index.html', body: 'x', type: 'text/html' }]
    });
    assert.equal(res.status, 403);
  } finally {
    await s.cleanup();
  }
});
