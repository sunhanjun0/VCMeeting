// HTTP + Socket.io bootstrap and module assembly.
// M1 (task 0.2): minimal server that boots, exposes a health check, and accepts
// Socket.io connections. core/registry, features, and gateway wiring land in later tasks.

import http from 'node:http';
import express from 'express';
import { Server as SocketIoServer } from 'socket.io';
import { config } from './config.js';
import { createBus } from './core/bus.js';
import { createRegistry } from './core/registry.js';
import { createSocketGateway } from './core/socket-gateway.js';

const app = express();

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

const httpServer = http.createServer(app);

const io = new SocketIoServer(httpServer, {
  cors: { origin: config.corsOrigin }
});

// --- Core assembly (features are registered in later tasks) ---
const bus = createBus();
const registry = createRegistry({ bus, config });
// registry.use(roomModule, contentModule, ...)  <-- tasks 3.x / 4.x

createSocketGateway({ io, bus, handlers: registry.socketEvents() });

httpServer.listen(config.port, () => {
  console.log(`[livepage] server listening on :${config.port}`);
});
