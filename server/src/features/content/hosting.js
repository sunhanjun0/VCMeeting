// Same-origin static hosting for uploaded bundles (TDD §8.3).
// Serves GET /content/:bundleId/* directly from the content-store's bundlesRoot
// via express.static — which is the battle-tested path here: it blocks `..`
// traversal (403), sets correct MIME types, handles conditional/range requests,
// and resolves directory requests to index.html. We layer on the security headers
// the spec requires.
//
// CSP (§8.3) is attached to HTML content pages — this is the policy the sandboxed
// iframe's document runs under. nosniff is attached to everything: uploaded content
// is untrusted, so we must stop the browser from MIME-sniffing e.g. a .txt into HTML.

import express from 'express';
import { extOf } from '../../services/content-store.js';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'"
].join('; ');

export function createContentStatic({ content }) {
  return express.static(content.bundlesRoot, {
    index: 'index.html',
    dotfiles: 'ignore',
    fallthrough: false, // a missing file is a 404 here, not a pass-through
    setHeaders(res, filePath) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const ext = extOf(filePath);
      if (ext === 'html' || ext === 'htm') {
        res.setHeader('Content-Security-Policy', CSP);
      }
    }
  });
}

export { CSP };
