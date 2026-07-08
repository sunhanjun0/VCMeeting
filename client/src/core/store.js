// Sliced state store (TDD §13.4). Each feature owns one slice: it may write only
// its own slice, and read others read-only. Changes are notified per-slice and
// globally, so React components can subscribe via useSyncExternalStore.

import { useSyncExternalStore } from 'react';

export function createStore(initial = {}) {
  let state = { ...initial };
  const sliceListeners = new Map(); // sliceName -> Set<listener>
  const globalListeners = new Set();

  function notify(name) {
    const set = sliceListeners.get(name);
    if (set) for (const fn of [...set]) fn();
    for (const fn of [...globalListeners]) fn();
  }

  function defineSlice(name, initialSlice = {}) {
    if (!(name in state)) {
      state = { ...state, [name]: initialSlice };
      notify(name);
    }
    return scoped(name);
  }

  function getSlice(name) {
    return state[name];
  }

  function getState() {
    return state;
  }

  // Merge a partial (or updater fn) into a slice and notify. New object identity
  // per change keeps useSyncExternalStore comparisons cheap.
  function setSlice(name, partialOrFn) {
    const prev = state[name] ?? {};
    const patch = typeof partialOrFn === 'function' ? partialOrFn(prev) : partialOrFn;
    state = { ...state, [name]: { ...prev, ...patch } };
    notify(name);
  }

  function subscribe(name, listener) {
    if (name == null) {
      globalListeners.add(listener);
      return () => globalListeners.delete(listener);
    }
    let set = sliceListeners.get(name);
    if (!set) {
      set = new Set();
      sliceListeners.set(name, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  // Scoped handle handed to a feature: write ONLY its own slice, read any slice.
  function scoped(owner) {
    return {
      get: () => state[owner],
      set: (partialOrFn) => setSlice(owner, partialOrFn),
      read: (other) => state[other],
      subscribe: (listener) => subscribe(owner, listener)
    };
  }

  return { defineSlice, getSlice, getState, setSlice, subscribe, scoped };
}

// React hook: read a slice and re-render when it changes.
export function useSlice(store, name) {
  return useSyncExternalStore(
    (listener) => store.subscribe(name, listener),
    () => store.getSlice(name)
  );
}
