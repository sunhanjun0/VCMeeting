// Room manager — in-memory room/participant state (TDD §4). Holds the single source
// of room truth for the process lifetime (no DB in MVP). Pure lifecycle + CRUD;
// bundle-file cleanup on reclaim is delegated to the caller via the returned rooms.
//
// Lifecycle (§4, §9): a host going offline only FREEZES the room (hostSessionId=null,
// participant kept with role='host' for reconnect). Rooms are reclaimed only when
// they have no connected participants AND have been idle past the threshold.

import { nanoid } from 'nanoid';

const DEFAULT_IDLE_RECLAIM_MS = 120 * 60 * 1000; // 2h

export function createRoomManager({ idleReclaimMs = DEFAULT_IDLE_RECLAIM_MS, now = Date.now } = {}) {
  /** @type {Map<string, Room>} */
  const rooms = new Map();

  function newPresentationState() {
    return {
      contentBundleId: null,
      currentPath: '',
      scrollAnchor: null,
      version: 0,
      updatedAt: now()
    };
  }

  function makeParticipant({ sessionId, socketId = null, name, role = 'guest' }) {
    return {
      sessionId,
      socketId,
      name,
      role,
      connected: true,
      following: true,
      mic: false,
      speaking: false
    };
  }

  // --- Room CRUD ---

  function createRoom({ passwordHash, hostSessionId, hostName, hostSocketId = null }) {
    const id = nanoid(10); // non-enumerable id (§ design constraint)
    const ts = now();
    const host = makeParticipant({
      sessionId: hostSessionId,
      socketId: hostSocketId,
      name: hostName,
      role: 'host'
    });
    const room = {
      id,
      passwordHash,
      hostSessionId,
      contentBundleId: null,
      latestState: newPresentationState(),
      participants: new Map([[hostSessionId, host]]),
      createdAt: ts,
      lastActiveAt: ts
    };
    rooms.set(id, room);
    return room;
  }

  function getRoom(id) {
    return rooms.get(id) || null;
  }

  function hasRoom(id) {
    return rooms.has(id);
  }

  // Remove a room and return it (so the caller can clean its bundle directory).
  function deleteRoom(id) {
    const room = rooms.get(id);
    if (room) rooms.delete(id);
    return room || null;
  }

  function touch(roomId) {
    const room = rooms.get(roomId);
    if (room) room.lastActiveAt = now();
  }

  // --- Participant CRUD ---

  function addParticipant(roomId, { sessionId, socketId, name, role = 'guest' }) {
    const room = rooms.get(roomId);
    if (!room) return null;
    const p = makeParticipant({ sessionId, socketId, name, role });
    room.participants.set(sessionId, p);
    room.lastActiveAt = now();
    return p;
  }

  function getParticipant(roomId, sessionId) {
    return rooms.get(roomId)?.participants.get(sessionId) || null;
  }

  function listParticipants(roomId) {
    const room = rooms.get(roomId);
    return room ? [...room.participants.values()] : [];
  }

  function removeParticipant(roomId, sessionId) {
    const room = rooms.get(roomId);
    if (!room) return null;
    const p = room.participants.get(sessionId);
    if (!p) return null;
    room.participants.delete(sessionId);
    // If the host was removed entirely, freeze the room.
    if (room.hostSessionId === sessionId) room.hostSessionId = null;
    room.lastActiveAt = now();
    return p;
  }

  function updateParticipant(roomId, sessionId, patch) {
    const p = getParticipant(roomId, sessionId);
    if (!p) return null;
    Object.assign(p, patch);
    return p;
  }

  // Connection state changes (reconnect handling, §9). When the host drops, the
  // room freezes (hostSessionId=null) but the participant record is kept so a
  // rejoin with the same sessionId restores host role and unfreezes.
  function setConnected(roomId, sessionId, connected) {
    const room = rooms.get(roomId);
    const p = room?.participants.get(sessionId);
    if (!p) return null;
    p.connected = connected;
    if (p.role === 'host') {
      room.hostSessionId = connected ? sessionId : null;
    }
    room.lastActiveAt = now();
    return p;
  }

  // --- Host transfer (§9) ---
  function transferHost(roomId, targetSessionId) {
    const room = rooms.get(roomId);
    if (!room) return null;
    const target = room.participants.get(targetSessionId);
    if (!target) return null;
    const prev = room.hostSessionId ? room.participants.get(room.hostSessionId) : null;
    if (prev) prev.role = 'guest';
    target.role = 'host';
    room.hostSessionId = targetSessionId;
    room.lastActiveAt = now();
    return room;
  }

  // --- Presentation state ---
  function setLatestState(roomId, patch) {
    const room = rooms.get(roomId);
    if (!room) return null;
    room.latestState = { ...room.latestState, ...patch, updatedAt: now() };
    room.lastActiveAt = now();
    return room.latestState;
  }

  function setContentBundle(roomId, bundleId) {
    const room = rooms.get(roomId);
    if (!room) return null;
    room.contentBundleId = bundleId;
    room.latestState = { ...room.latestState, contentBundleId: bundleId, updatedAt: now() };
    room.lastActiveAt = now();
    return room;
  }

  // --- Reclaim ---
  function connectedCount(room) {
    let n = 0;
    for (const p of room.participants.values()) if (p.connected) n++;
    return n;
  }

  // Reclaim rooms with zero connected participants that have been idle past the
  // threshold. Returns the removed rooms so the caller can delete their bundles.
  function reclaimIdle(nowMs = now()) {
    const removed = [];
    for (const room of rooms.values()) {
      if (connectedCount(room) === 0 && nowMs - room.lastActiveAt > idleReclaimMs) {
        rooms.delete(room.id);
        removed.push(room);
      }
    }
    return removed;
  }

  return {
    createRoom,
    getRoom,
    hasRoom,
    deleteRoom,
    touch,
    addParticipant,
    getParticipant,
    listParticipants,
    removeParticipant,
    updateParticipant,
    setConnected,
    transferHost,
    setLatestState,
    setContentBundle,
    reclaimIdle,
    connectedCount,
    _rooms: rooms // exposed for diagnostics/tests
  };
}
