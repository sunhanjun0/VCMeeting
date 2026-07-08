// Room feature (server) — create/join/leave/reconnect + lifecycle (TDD §5, §9).
// Self-contained FeatureModule: owns its network events (socketEvents) and talks
// to infrastructure services via injected deps. Never imports other features.

import { nanoid } from 'nanoid';
import { hashPassword, verifyPassword } from '../../services/password.js';
import { NET_OUT } from '../../core/events.js';

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const ackError = (ctx, code, message) => ctx.ack({ ok: false, error: { code, message } });

// Build the join snapshot (§5.3). The voice block is delegated to an optional
// VoiceBackend (§7.4b) so room stays decoupled from voice; it's null until M4.
function buildSnapshot(rooms, room, participant, voiceBackend) {
  return {
    sessionId: participant.sessionId,
    role: participant.role,
    latestState: room.latestState,
    content: room.contentBundle || null,
    participants: rooms.listParticipants(room.id),
    voice: voiceBackend ? voiceBackend.onJoin(room, participant) : null
  };
}

export function createRoomModule({ rooms, tokens, voiceBackend = null }) {
  let net = null;

  function handleCreate(ctx) {
    const { name, password } = ctx.payload || {};
    if (!isNonEmpty(name)) return ackError(ctx, 'bad_name', 'name is required');
    if (!isNonEmpty(password)) return ackError(ctx, 'bad_password', 'password is required');

    const sessionId = nanoid(16);
    const room = rooms.createRoom({
      passwordHash: hashPassword(password),
      hostSessionId: sessionId,
      hostName: name.trim(),
      hostSocketId: ctx.socket.id
    });
    const token = tokens.issue(room.id);

    ctx.bind({ sessionId, roomId: room.id, role: 'host' });
    return { roomId: room.id, token, sessionId };
  }

  // Password OR share-token authorizes a join (§9). Token takes precedence.
  function authorize(room, payload) {
    if (isNonEmpty(payload.token)) {
      const v = tokens.verify(payload.token);
      return v.ok && v.roomId === room.id;
    }
    if (isNonEmpty(payload.password)) {
      return verifyPassword(payload.password, room.passwordHash);
    }
    return false;
  }

  function handleJoin(ctx) {
    const payload = ctx.payload || {};
    const { roomId, name, sessionId: providedSid } = payload;
    if (!isNonEmpty(roomId)) return ackError(ctx, 'bad_request', 'roomId is required');

    const room = rooms.getRoom(roomId);
    if (!room) return ackError(ctx, 'room_not_found', 'Room does not exist');
    if (!authorize(room, payload)) return ackError(ctx, 'unauthorized', 'Invalid password or token');
    if (!isNonEmpty(name)) return ackError(ctx, 'bad_name', 'name is required');

    let participant;
    let isReconnect = false;

    // Reconnect: a matching sessionId restores the existing record (incl. host, §9).
    if (isNonEmpty(providedSid) && rooms.getParticipant(roomId, providedSid)) {
      rooms.updateParticipant(roomId, providedSid, { socketId: ctx.socket.id, name: name.trim() });
      participant = rooms.setConnected(roomId, providedSid, true);
      isReconnect = true;
    } else {
      const sid = nanoid(16);
      participant = rooms.addParticipant(roomId, {
        sessionId: sid,
        socketId: ctx.socket.id,
        name: name.trim(),
        role: 'guest'
      });
    }

    ctx.bind({ sessionId: participant.sessionId, roomId, role: participant.role });

    // Notify the rest of the room.
    if (isReconnect) {
      ctx.broadcast(NET_OUT.PARTICIPANT_UPDATED, { sessionId: participant.sessionId, connected: true });
    } else {
      ctx.broadcast(NET_OUT.PARTICIPANT_JOINED, participant);
    }

    return buildSnapshot(rooms, room, participant, voiceBackend);
  }

  function handleLeave(ctx) {
    const s = ctx.session;
    if (!s) return { left: true };
    rooms.removeParticipant(s.roomId, s.sessionId);
    ctx.broadcast(NET_OUT.PARTICIPANT_LEFT, { sessionId: s.sessionId });
    ctx.unbind();
    return { left: true };
  }

  // Disconnect (bus-driven, no per-message socket): freeze/mark offline + notify.
  function onDisconnect({ session }) {
    if (!session) return;
    const p = rooms.setConnected(session.roomId, session.sessionId, false);
    if (!p || !net) return;
    net.broadcastToRoom(session.roomId, NET_OUT.PARTICIPANT_UPDATED, {
      sessionId: session.sessionId,
      connected: false
    });
    // Host offline: room-manager already froze the room (hostSessionId=null).
  }

  return {
    name: 'room',
    init(ctx) {
      net = ctx.net;
      ctx.bus.on('connection:closed', onDisconnect);
    },
    socketEvents: {
      'room:create': handleCreate,
      'room:join': handleJoin,
      'room:leave': handleLeave
    }
  };
}
