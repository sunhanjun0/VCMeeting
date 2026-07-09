// Content feature (server) — upload + same-origin hosting + content switch (TDD §8, §5, §3).
// Self-contained FeatureModule: owns the HTTP surface for content (upload +
// static hosting) and the content:* socket events.
// Talks to infrastructure via injected deps; never imports other features.

import { createUploadHandler } from './upload.js';
import { createContentStatic } from './hosting.js';
import { NET_OUT } from '../../core/events.js';

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const ackError = (ctx, code, message) => ctx.ack({ ok: false, error: { code, message } });

export function createContentModule({ rooms, content, maxBytes }) {
  // content:set (host-only, enforced by the gateway) switches the room's active
  // presentation content to a previously-uploaded bundle, then tells everyone to
  // reload (§5). The full ContentBundle is resolved authoritatively from the
  // content-store — the client only supplies an id.
  async function handleSet(ctx) {
    const { bundleId } = ctx.payload || {};
    if (!isNonEmpty(bundleId)) return ackError(ctx, 'bad_request', 'bundleId is required');

    const room = rooms.getRoom(ctx.session.roomId);
    if (!room) return ackError(ctx, 'room_not_found', 'Room does not exist');

    const bundle = await content.getBundle(bundleId);
    if (!bundle) return ackError(ctx, 'bundle_not_found', 'Bundle does not exist');
    // A bundle is uploaded through one room's endpoint; don't let it be activated elsewhere.
    if (bundle.roomId && bundle.roomId !== room.id) {
      return ackError(ctx, 'forbidden', 'Bundle belongs to another room');
    }

    rooms.setContentBundle(room.id, bundle);
    // Everyone (host included) reloads the iframe from the same event path.
    ctx.broadcast(NET_OUT.CONTENT_CHANGED, { bundle }, { includeSelf: true });
    return { bundle };
  }

  return {
    name: 'content',
    init(ctx) {
      const app = ctx.http;
      if (!app) throw new Error('content module requires ctx.http (express app)');

      // §8.1 upload endpoint. Host-session auth + multipart parsing live in the
      // handler; the content-store owns all file validation.
      app.post(
        '/api/rooms/:roomId/content',
        createUploadHandler({ rooms, content, maxBytes })
      );

      // §8.3 same-origin static hosting of uploaded bundles + security headers.
      app.use('/content', createContentStatic({ content }));
    },
    socketEvents: {
      'content:set': handleSet
    }
  };
}
