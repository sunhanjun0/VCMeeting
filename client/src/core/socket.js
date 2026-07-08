// Socket.io client bridge — the ONLY client-side place that imports socket.io-client
// (TDD §13.2). Bridges the network bus and the in-process bus:
//   - inbound:  every { type, v, payload } envelope becomes bus.emit(type, payload),
//               so feature modules subscribe via the bus and never touch the socket.
//   - outbound: send() (fire-and-forget) and request() (ack -> Promise) wrap payloads
//               into the versioned envelope.
// Feature modules use send/request (a core abstraction); they never import socket.io.

import { io } from 'socket.io-client';
import { ENVELOPE_VERSION } from './events.js';

const WIRE_EVENT = 'net';

export function createSocketClient({ bus, url = '/' }) {
  const socket = io(url, { autoConnect: false, transports: ['websocket'] });

  socket.on('connect', () => bus.emit('socket:connected', { id: socket.id }));
  socket.on('disconnect', (reason) => bus.emit('socket:disconnected', { reason }));

  // Inbound: translate each network envelope into an in-process bus event.
  socket.on(WIRE_EVENT, (envelope) => {
    if (!envelope || typeof envelope.type !== 'string') return;
    bus.emit(envelope.type, envelope.payload);
  });

  const pack = (type, payload) => ({ type, v: ENVELOPE_VERSION, payload });

  // Fire-and-forget broadcast-style send (e.g. sync:state, voice:update).
  function send(type, payload) {
    socket.emit(WIRE_EVENT, pack(type, payload));
  }

  // Request/response with ack (e.g. room:create, room:join). Resolves { ok, data|error }.
  function request(type, payload) {
    return new Promise((resolve) => {
      socket.emit(WIRE_EVENT, pack(type, payload), (res) => resolve(res));
    });
  }

  return {
    socket,
    send,
    request,
    connect: () => socket.connect(),
    disconnect: () => socket.disconnect()
  };
}
