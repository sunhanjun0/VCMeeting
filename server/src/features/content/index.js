// Content feature (server) — upload + same-origin hosting (TDD §8, §3).
// Self-contained FeatureModule: owns the HTTP surface for content (upload now,
// static hosting in task 4.2) and the content:* socket events (task 4.3).
// Talks to infrastructure via injected deps; never imports other features.

import { createUploadHandler } from './upload.js';

export function createContentModule({ rooms, content, maxBytes }) {
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
    }
    // socketEvents (content:set → content:changed) arrive in task 4.3.
  };
}
