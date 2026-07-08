// Event name constants (client side), mirroring the server protocol (TDD §5).
// NET_IN: events this client sends; NET_OUT: events it receives.

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

// Schema version for the network envelope { type, v, payload } (§13.2).
export const ENVELOPE_VERSION = 1;
