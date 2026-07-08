// Event name constants — both network events (Socket.io, TDD §5) and in-process
// bus events (TDD §13.2). Namespaced: room:* sync:* content:* voice:* permission:*.
// Keeping these centralized avoids typos and documents the full protocol surface.

// --- Network events: client -> server (§5.1) ---
export const NET_IN = {
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  CONTENT_SET: 'content:set',
  SYNC_STATE: 'sync:state',
  SYNC_CLICK: 'sync:click',
  FOLLOW_RESUME: 'follow:resume',
  HOST_MUTE: 'host:mute',
  HOST_PULLBACK: 'host:pullback',
  HOST_TRANSFER: 'host:transfer',
  WEBRTC_SIGNAL: 'webrtc:signal',
  VOICE_UPDATE: 'voice:update'
};

// --- Network events: server -> client (§5.2) ---
export const NET_OUT = {
  PARTICIPANT_JOINED: 'participant:joined',
  PARTICIPANT_LEFT: 'participant:left',
  PARTICIPANT_UPDATED: 'participant:updated',
  SYNC_STATE: 'sync:state',
  SYNC_CLICK: 'sync:click',
  CONTENT_CHANGED: 'content:changed',
  HOST_CHANGED: 'host:changed',
  FOLLOW_PULLBACK: 'follow:pullback',
  WEBRTC_SIGNAL: 'webrtc:signal',
  VOICE_MODE: 'voice:mode',
  ERROR: 'error'
};

// --- Host-only network events (server enforces role==='host', §5) ---
export const HOST_ONLY = new Set([
  NET_IN.CONTENT_SET,
  NET_IN.SYNC_STATE,
  NET_IN.SYNC_CLICK,
  NET_IN.HOST_MUTE,
  NET_IN.HOST_PULLBACK,
  NET_IN.HOST_TRANSFER
]);

// Current schema version for the network envelope { type, v, payload } (§13.2).
export const ENVELOPE_VERSION = 1;
