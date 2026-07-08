// HTTP + Socket.io bootstrap and module assembly.
// M1 (task 0.2): minimal server that boots, exposes a health check, and accepts
// Socket.io connections. core/registry, features, and gateway wiring land in later tasks.

import http from 'node:http';
import express from 'express';
import { Server as SocketIoServer } from 'socket.io';
import { config } from './config.js';

const app = express();

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

const httpServer = http.createServer(app);

const io = new SocketIoServer(httpServer, {
  cors: { origin: config.corsOrigin }
});

io.on('connection', (socket) => {
  // Placeholder: core/socket-gateway (task 1.2) will bridge network <-> bus here.
  console.log(`[socket] connected: ${socket.id}`);
  socket.on('disconnect', (reason) => {
    console.log(`[socket] disconnected: ${socket.id} (${reason})`);
  });
});

httpServer.listen(config.port, () => {
  console.log(`[livepage] server listening on :${config.port}`);
});
