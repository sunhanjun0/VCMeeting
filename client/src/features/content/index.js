// Content feature (client) — owns the 'content' state slice. Tracks the room's
// active presentation bundle from the content:changed network event so the iframe
// stage (task 4.5) can (re)load it. Upload flow lives in actions.js / UploadPanel.
// Talks only via bus + store + net (§13); never imports another feature.

import { NET_OUT } from '../../core/events.js';

const INITIAL = {
  active: null // the room's active ContentBundle (from content:changed)
};

export function createContentModule() {
  return {
    name: 'content',
    init(ctx) {
      const { bus, store, slice } = ctx;
      store.defineSlice('content', INITIAL);

      // Host and guests alike: when the host switches content, record the new
      // bundle. content:set broadcasts with includeSelf, so the host lands here too.
      bus.on(NET_OUT.CONTENT_CHANGED, ({ bundle }) => {
        slice.set({ active: bundle });
      });
    }
  };
}
