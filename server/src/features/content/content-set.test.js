// Unit tests for the content:set socket handler (task 4.3).
// Drives the module's socketEvents['content:set'] with a mock message ctx,
// backed by a real room-manager + content-store (temp dir).

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { createRoomManager } from '../../services/room-manager.js';
import { createContentStore } from '../../services/content-store.js';
import { createContentModule } from './index.js';

async function setup() {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lp-set-'));
  const rooms = createRoomManager();
  const content = createContentStore({ dataDir, maxBytes: 1024 * 1024 });
  const mod = createContentModule({ rooms, content, maxBytes: 1024 * 1024 });
  const handleSet = mod.socketEvents['content:set'];
  const cleanup = () => fsp.rm(dataDir, { recursive: true, force: true });
  return { rooms, content, handleSet, cleanup };
}

function makeCtx({ session, payload }) {
  const calls = { broadcast: [], ack: [] };
  const ctx = {
    session,
    payload,
    _acked: false,
    ack(r) { ctx._acked = true; calls.ack.push(r); },
    broadcast(type, data, opts) { calls.broadcast.push({ type, data, opts }); }
  };
  return { ctx, calls };
}

async function seed(content, roomId) {
  return content.storeFiles(
    [{ relativePath: 'index.html', buffer: Buffer.from('<h1>hi</h1>') }],
    { uploadedBy: 'h1', roomId }
  );
}

test('content:set switches the room bundle + broadcasts content:changed to all', async () => {
  const s = await setup();
  try {
    const room = s.rooms.createRoom({ passwordHash: 'x', hostSessionId: 'h1', hostName: 'Host' });
    const bundle = await seed(s.content, room.id);

    const { ctx, calls } = makeCtx({ session: { roomId: room.id, role: 'host' }, payload: { bundleId: bundle.id } });
    const result = await s.handleSet(ctx);

    // Room state updated with the full bundle.
    assert.equal(s.rooms.getRoom(room.id).contentBundleId, bundle.id);
    assert.deepEqual(s.rooms.getRoom(room.id).contentBundle, bundle);
    assert.equal(s.rooms.getRoom(room.id).latestState.contentBundleId, bundle.id);

    // Broadcast to everyone, host included.
    assert.equal(calls.broadcast.length, 1);
    assert.equal(calls.broadcast[0].type, 'content:changed');
    assert.deepEqual(calls.broadcast[0].data, { bundle });
    assert.equal(calls.broadcast[0].opts.includeSelf, true);

    // Handler returns the bundle for the ack.
    assert.deepEqual(result, { bundle });
  } finally {
    await s.cleanup();
  }
});

test('content:set with missing bundleId → bad_request, no broadcast', async () => {
  const s = await setup();
  try {
    const room = s.rooms.createRoom({ passwordHash: 'x', hostSessionId: 'h1', hostName: 'Host' });
    const { ctx, calls } = makeCtx({ session: { roomId: room.id, role: 'host' }, payload: {} });
    await s.handleSet(ctx);
    assert.equal(calls.ack[0].ok, false);
    assert.equal(calls.ack[0].error.code, 'bad_request');
    assert.equal(calls.broadcast.length, 0);
  } finally {
    await s.cleanup();
  }
});

test('content:set with unknown bundleId → bundle_not_found', async () => {
  const s = await setup();
  try {
    const room = s.rooms.createRoom({ passwordHash: 'x', hostSessionId: 'h1', hostName: 'Host' });
    const { ctx, calls } = makeCtx({ session: { roomId: room.id, role: 'host' }, payload: { bundleId: 'nope123' } });
    await s.handleSet(ctx);
    assert.equal(calls.ack[0].error.code, 'bundle_not_found');
    assert.equal(calls.broadcast.length, 0);
  } finally {
    await s.cleanup();
  }
});

test('content:set rejects a bundle uploaded for another room', async () => {
  const s = await setup();
  try {
    const room = s.rooms.createRoom({ passwordHash: 'x', hostSessionId: 'h1', hostName: 'Host' });
    const otherBundle = await seed(s.content, 'some-other-room');
    const { ctx, calls } = makeCtx({ session: { roomId: room.id, role: 'host' }, payload: { bundleId: otherBundle.id } });
    await s.handleSet(ctx);
    assert.equal(calls.ack[0].error.code, 'forbidden');
    assert.equal(calls.broadcast.length, 0);
    assert.equal(s.rooms.getRoom(room.id).contentBundle, null);
  } finally {
    await s.cleanup();
  }
});
