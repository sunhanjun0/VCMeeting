// Socket.io gateway — the ONLY server-side place that touches sockets (TDD §13.2).
// Bridges the network bus and the in-process bus in both directions:
//   - inbound:  parse the { type, v, payload } envelope, ignore unknown types
//               (forward-compat), enforce host-only permission, then dispatch to
//               the feature's registered socketEvents handler.
//   - outbound: hand handlers helpers (ack / broadcast / sendTo) that wrap payloads
//               back into the versioned envelope before emitting.
//
// All network traffic rides a single Socket.io event ('net') carrying the envelope,
// so unknown/new event types degrade gracefully instead of erroring.

import { ENVELOPE_VERSION, HOST_ONLY, NET_OUT } from './events.js';

const WIRE_EVENT = 'net';

export function createSocketGateway({ io, bus, handlers }) {
  // sessionId -> socketId, so relay (webrtc:signal) and directed pushes can target a session.
  const sessionSockets = new Map();

  const pack = (type, payload) => ({ type, v: ENVELOPE_VERSION, payload });

  function sendToSocket(socketId, type, payload) {
    io.to(socketId).emit(WIRE_EVENT, pack(type, payload));
  }

  function sendToSession(sessionId, type, payload) {
    const socketId = sessionSockets.get(sessionId);
    if (socketId) sendToSocket(socketId, type, payload);
  }

  io.on('connection', (socket) => {
    socket.on(WIRE_EVENT, (envelope, ack) => {
      handleInbound(socket, envelope, ack);
    });

    socket.on('disconnect', (reason) => {
      const session = socket.data.session;
      if (session) {
        if (sessionSockets.get(session.sessionId) === socket.id) {
          sessionSockets.delete(session.sessionId);
        }
        // Lifecycle signal for feature modules (e.g. room marks participant offline).
        bus.emit('connection:closed', { session, reason });
      }
    });
  });

  function handleInbound(socket, envelope, ack) {
    // Envelope validation — malformed frames are ignored (never throw to a client).
    if (!envelope || typeof envelope.type !== 'string') return;
    const { type, payload } = envelope;

    const respond = makeAck(ack);
    const handler = handlers[type];

    // Unknown type: gracefully ignore for forward-compat (§13.2). Ack if the
    // client expected a response so it isn't left hanging.
    if (!handler) {
      respond({ ok: false, error: { code: 'unknown_type', message: `Unknown event: ${type}` } });
      return;
    }

    // Host-only permission enforcement (§5). Session/role is bound at room:join.
    if (HOST_ONLY.has(type) && socket.data.session?.role !== 'host') {
      sendToSocket(socket.id, NET_OUT.ERROR, { code: 'forbidden', message: `Host-only: ${type}` });
      respond({ ok: false, error: { code: 'forbidden', message: `Host-only: ${type}` } });
      return;
    }

    const ctx = buildMessageCtx(socket, payload, respond);
    Promise.resolve(handler(ctx))
      .then((result) => {
        // Handlers may return an ack result directly, or call ctx.ack themselves.
        if (result !== undefined && !ctx._acked) respond({ ok: true, data: result });
      })
      .catch((err) => {
        sendToSocket(socket.id, NET_OUT.ERROR, { code: 'internal', message: err.message });
        respond({ ok: false, error: { code: 'internal', message: err.message } });
      });
  }

  function buildMessageCtx(socket, payload, respond) {
    const ctx = {
      socket,
      payload,
      _acked: false,
      get session() {
        return socket.data.session || null;
      },
      // Bind this connection to a session/room after a successful join/create.
      bind(session) {
        socket.data.session = session;
        sessionSockets.set(session.sessionId, socket.id);
        socket.join(session.roomId);
      },
      unbind() {
        const session = socket.data.session;
        if (session) {
          sessionSockets.delete(session.sessionId);
          socket.leave(session.roomId);
          socket.data.session = null;
        }
      },
      ack(result) {
        ctx._acked = true;
        respond(result);
      },
      // Broadcast to everyone in the caller's room (self excluded by default).
      broadcast(type, data, { includeSelf = false } = {}) {
        const roomId = socket.data.session?.roomId;
        if (!roomId) return;
        const target = includeSelf ? io.to(roomId) : socket.to(roomId);
        target.emit(WIRE_EVENT, pack(type, data));
      },
      sendToSession,
      sendToSocket
    };
    return ctx;
  }

  return {
    // Exposed so feature modules driven by bus events (not inbound sockets) can push out.
    sendToSession,
    sendToSocket,
    sessionSockets
  };
}

// Wrap the optional Socket.io ack callback so handlers can respond safely whether
// or not the client supplied one.
function makeAck(ack) {
  if (typeof ack !== 'function') return () => {};
  let used = false;
  return (result) => {
    if (used) return;
    used = true;
    ack(result);
  };
}
