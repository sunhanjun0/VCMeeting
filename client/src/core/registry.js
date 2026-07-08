// Feature module registry (client side, TDD §13.3). Assembles self-contained
// feature modules; core never imports features — modules get { bus, store, config }
// via init(ctx). Unlike the server, client modules subscribe to the bus directly
// (no socketEvents map; core/socket.js owns the network bridge).
//
// FeatureModule interface: { name, init(ctx), dispose?() }

export function createRegistry(ctx) {
  const modules = [];

  function use(...featureModules) {
    for (const mod of featureModules) {
      if (!mod || typeof mod.init !== 'function') {
        throw new Error(`Invalid feature module: ${mod?.name ?? '<unnamed>'}`);
      }
      // Hand each module a store scoped to its own slice for write-safety.
      const moduleCtx = { ...ctx, slice: ctx.store?.scoped(mod.name) };
      mod.init(moduleCtx);
      modules.push(mod);
    }
    return api;
  }

  function dispose() {
    for (let i = modules.length - 1; i >= 0; i--) modules[i].dispose?.();
    modules.length = 0;
  }

  const api = { use, dispose, list: () => modules.map((m) => m.name) };
  return api;
}
