import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomManager } from './room-manager.js';

// Injectable clock so idle-reclaim is deterministic.
function withClock() {
  let t = 1_000_000;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('createRoom: host is registered as connected host participant', () => {
  const rm = createRoomManager();
  const room = rm.createRoom({ passwordHash: 'h', hostSessionId: 'host1', hostName: 'Alice' });
  assert.ok(room.id && room.id.length >= 8);
  assert.equal(room.hostSessionId, 'host1');
  const host = rm.getParticipant(room.id, 'host1');
  assert.equal(host.role, 'host');
  assert.equal(host.connected, true);
  assert.equal(rm.connectedCount(room), 1);
});

test('room ids are unique / non-trivial', () => {
  const rm = createRoomManager();
  const ids = new Set();
  for (let i = 0; i < 100; i++) {
    ids.add(rm.createRoom({ passwordHash: 'h', hostSessionId: 's' + i, hostName: 'x' }).id);
  }
  assert.equal(ids.size, 100);
});

test('get / delete room', () => {
  const rm = createRoomManager();
  const room = rm.createRoom({ passwordHash: 'h', hostSessionId: 'h1', hostName: 'A' });
  assert.equal(rm.getRoom(room.id).id, room.id);
  const removed = rm.deleteRoom(room.id);
  assert.equal(removed.id, room.id);
  assert.equal(rm.getRoom(room.id), null);
  assert.equal(rm.hasRoom(room.id), false);
});

test('participant add / update / remove', () => {
  const rm = createRoomManager();
  const room = rm.createRoom({ passwordHash: 'h', hostSessionId: 'h1', hostName: 'A' });
  const g = rm.addParticipant(room.id, { sessionId: 'g1', socketId: 'sk1', name: 'Bob' });
  assert.equal(g.role, 'guest');
  assert.equal(rm.listParticipants(room.id).length, 2);

  rm.updateParticipant(room.id, 'g1', { following: false, mic: true });
  const updated = rm.getParticipant(room.id, 'g1');
  assert.equal(updated.following, false);
  assert.equal(updated.mic, true);

  const removed = rm.removeParticipant(room.id, 'g1');
  assert.equal(removed.sessionId, 'g1');
  assert.equal(rm.getParticipant(room.id, 'g1'), null);
});

test('host offline freezes room; reconnect restores host', () => {
  const rm = createRoomManager();
  const room = rm.createRoom({ passwordHash: 'h', hostSessionId: 'h1', hostName: 'A' });
  rm.setConnected(room.id, 'h1', false);
  assert.equal(rm.getRoom(room.id).hostSessionId, null); // frozen
  assert.equal(rm.getParticipant(room.id, 'h1').role, 'host'); // record kept

  rm.setConnected(room.id, 'h1', true);
  assert.equal(rm.getRoom(room.id).hostSessionId, 'h1'); // restored
});

test('transferHost swaps roles', () => {
  const rm = createRoomManager();
  const room = rm.createRoom({ passwordHash: 'h', hostSessionId: 'h1', hostName: 'A' });
  rm.addParticipant(room.id, { sessionId: 'g1', name: 'Bob' });
  rm.transferHost(room.id, 'g1');
  assert.equal(rm.getRoom(room.id).hostSessionId, 'g1');
  assert.equal(rm.getParticipant(room.id, 'g1').role, 'host');
  assert.equal(rm.getParticipant(room.id, 'h1').role, 'guest');
});

test('setContentBundle updates room + latestState', () => {
  const rm = createRoomManager();
  const room = rm.createRoom({ passwordHash: 'h', hostSessionId: 'h1', hostName: 'A' });
  rm.setContentBundle(room.id, 'bundle1');
  assert.equal(rm.getRoom(room.id).contentBundleId, 'bundle1');
  assert.equal(rm.getRoom(room.id).latestState.contentBundleId, 'bundle1');
});

test('reclaimIdle: empty + idle room is reclaimed, active/populated is not', () => {
  const clock = withClock();
  const rm = createRoomManager({ idleReclaimMs: 1000, now: clock.now });

  const empty = rm.createRoom({ passwordHash: 'h', hostSessionId: 'h1', hostName: 'A' });
  rm.setConnected(empty.id, 'h1', false); // all disconnected -> empty

  const populated = rm.createRoom({ passwordHash: 'h', hostSessionId: 'h2', hostName: 'B' });
  // still connected

  clock.advance(1500); // exceed threshold
  const removed = rm.reclaimIdle();
  assert.equal(removed.length, 1);
  assert.equal(removed[0].id, empty.id);
  assert.equal(rm.hasRoom(empty.id), false);
  assert.equal(rm.hasRoom(populated.id), true); // has a connected participant
});

test('reclaimIdle: empty but not yet idle is kept', () => {
  const clock = withClock();
  const rm = createRoomManager({ idleReclaimMs: 1000, now: clock.now });
  const room = rm.createRoom({ passwordHash: 'h', hostSessionId: 'h1', hostName: 'A' });
  rm.setConnected(room.id, 'h1', false);
  clock.advance(500); // below threshold
  assert.equal(rm.reclaimIdle().length, 0);
  assert.equal(rm.hasRoom(room.id), true);
});
