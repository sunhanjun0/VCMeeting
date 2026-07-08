// App assembly (app layer, NOT core). This is the one place allowed to import both
// core and feature modules and wire them together — keeping core feature-free
// (TDD §13.1 rule 2). Adding a feature = one createXxxModule() + registry.use().

import { createBus } from './core/bus.js';
import { createStore } from './core/store.js';
import { createSocketClient } from './core/socket.js';
import { createRegistry } from './core/registry.js';
import { createRoomModule } from './features/room/index.js';

export function createApp({ url = '/', config = {} } = {}) {
  const bus = createBus();
  const store = createStore();
  const socket = createSocketClient({ bus, url });
  const net = { send: socket.send, request: socket.request };

  const registry = createRegistry({ bus, store, config, net });
  registry.use(
    createRoomModule()
    // contentModule, syncModule, ... <-- tasks 4.x / M2+
  );

  return {
    bus,
    store,
    config,
    net,
    registry,
    connect: socket.connect,
    disconnect: socket.disconnect
  };
}
