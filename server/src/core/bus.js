// In-process event bus (layer one of the two-tier communication model, TDD §13.2).
// Lightweight pub/sub, mitt-style. Feature modules communicate exclusively through
// this bus and the shared store; they never call each other directly.

export function createBus() {
  /** @type {Map<string, Set<Function>>} */
  const handlers = new Map();

  function on(type, handler) {
    let set = handlers.get(type);
    if (!set) {
      set = new Set();
      handlers.set(type, set);
    }
    set.add(handler);
    return () => off(type, handler);
  }

  function off(type, handler) {
    const set = handlers.get(type);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) handlers.delete(type);
  }

  function emit(type, payload) {
    const set = handlers.get(type);
    if (!set) return;
    // Copy to tolerate handlers that subscribe/unsubscribe during dispatch.
    for (const handler of [...set]) {
      handler(payload);
    }
  }

  function clear() {
    handlers.clear();
  }

  return { on, off, emit, clear };
}
