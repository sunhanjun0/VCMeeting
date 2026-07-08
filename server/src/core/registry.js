// Feature module registry (TDD §13.3). Assembles self-contained feature modules.
// Enforces the dependency rule implicitly: core never imports features; features
// are handed only { bus, store/services, config } via init(ctx).
//
// FeatureModule interface:
//   { name, init(ctx), dispose?(), socketEvents?: Record<eventType, handler> }
// socketEvents are collected here for core/socket-gateway (task 1.2) to mount.

export function createRegistry(ctx) {
  const modules = [];

  function use(...featureModules) {
    for (const mod of featureModules) {
      if (!mod || typeof mod.init !== 'function') {
        throw new Error(`Invalid feature module: ${mod?.name ?? '<unnamed>'}`);
      }
      mod.init(ctx);
      modules.push(mod);
    }
    return api;
  }

  // Merge all modules' socketEvents into one map for the gateway to bind.
  function socketEvents() {
    const merged = {};
    for (const mod of modules) {
      if (!mod.socketEvents) continue;
      for (const [type, handler] of Object.entries(mod.socketEvents)) {
        if (merged[type]) {
          throw new Error(`Duplicate socket handler for "${type}" (module ${mod.name})`);
        }
        merged[type] = handler;
      }
    }
    return merged;
  }

  function dispose() {
    // Dispose in reverse registration order.
    for (let i = modules.length - 1; i >= 0; i--) {
      modules[i].dispose?.();
    }
    modules.length = 0;
  }

  const api = { use, socketEvents, dispose, list: () => modules.map((m) => m.name) };
  return api;
}
