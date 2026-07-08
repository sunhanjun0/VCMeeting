// HTTP + Socket.io bootstrap and module assembly.

import http from 'node:http';
import express from 'express';
import { Server as SocketIoServer } from 'socket.io';
import { config } from './config.js';
import { createBus } from './core/bus.js';
import { createRegistry } from './core/registry.js';
import { createSocketGateway } from './core/socket-gateway.js';
import { createRoomManager } from './services/room-manager.js';
import { createTokenService } from './services/token.js';
import { createContentStore } from './services/content-store.js';
import { createRoomModule } from './features/room/index.js';

const app = express();

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

const httpServer = http.createServer(app);

const io = new SocketIoServer(httpServer, {
  cors: { origin: config.corsOrigin }
});

// --- Infrastructure services ---
const rooms = createRoomManager({ idleReclaimMs: config.roomIdleReclaimMinutes * 60 * 1000 });
const tokens = createTokenService({ ttlHours: config.tokenTtlHours });
const content = createContentStore({ dataDir: config.dataDir, maxBytes: config.uploadMaxMb * 1024 * 1024 });

// --- Core assembly ---
const bus = createBus();
// Gateway is created first so feature modules can receive its outbound `net` API;
// handlers are attached afterwards once modules have registered their socketEvents.
const gateway = createSocketGateway({ io, bus });
const registry = createRegistry({ bus, config, services: { rooms, tokens, content }, net: gateway });
registry.use(
  createRoomModule({ rooms, tokens })
  // contentModule, ... <-- task 4.x
);
gateway.setHandlers(registry.socketEvents());

httpServer.listen(config.port, () => {
  console.log(`[livepage] server listening on :${config.port}`);
});
