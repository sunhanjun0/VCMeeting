// Room actions — imperative flows that use the core net (request) + store, and
// persist sessionId for reconnect (§9). UI calls these; they never touch sockets.

const STORAGE_KEY = 'livepage:sessions';

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveSession(roomId, sessionId) {
  if (typeof localStorage === 'undefined') return;
  const all = readStore();
  all[roomId] = sessionId;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function loadSession(roomId) {
  if (typeof localStorage === 'undefined') return null;
  return readStore()[roomId] || null;
}

export async function createRoom(app, { name, password }) {
  const res = await app.net.request('room:create', { name, password });
  if (!res.ok) throw new Error(res.error?.message || 'Failed to create room');
  const { roomId, token, sessionId } = res.data;
  saveSession(roomId, sessionId);
  app.store.setSlice('room', {
    roomId,
    sessionId,
    token,
    role: 'host',
    status: 'joined',
    error: null,
    participants: [
      { sessionId, name, role: 'host', connected: true, following: true, mic: false, speaking: false }
    ]
  });
  return { roomId, token, sessionId };
}

export async function joinRoom(app, { roomId, name, password, token }) {
  // Reuse a stored sessionId so the server can restore our record (reconnect).
  const sessionId = loadSession(roomId);
  const res = await app.net.request('room:join', { roomId, name, password, token, sessionId });
  if (!res.ok) throw new Error(res.error?.message || 'Failed to join room');
  const snap = res.data;
  saveSession(roomId, snap.sessionId);
  app.store.setSlice('room', {
    roomId,
    sessionId: snap.sessionId,
    role: snap.role,
    token: token || null,
    participants: snap.participants,
    latestState: snap.latestState,
    content: snap.content,
    status: 'joined',
    error: null
  });
  return snap;
}

export async function leaveRoom(app) {
  await app.net.request('room:leave', {});
  app.store.setSlice('room', {
    status: 'idle',
    roomId: null,
    sessionId: null,
    role: null,
    participants: []
  });
}

// Build a shareable room link carrying the link-token (§2.2). Recipients open it to
// auto-join without the password until the token expires (auto-join is task 5.2);
// without a token it's just the plain room URL (they'll need the password).
export function buildShareLink(roomId, token) {
  const base = `${window.location.origin}/room/${encodeURIComponent(roomId)}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
