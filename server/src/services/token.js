// Share-link token service (TDD §9, design constraints). Stateless HMAC tokens
// carrying { roomId, exp } — no storage needed.
//   - TTL: default 24h, configurable per issue().
//   - NOT one-time: the same token verifies repeatedly until expiry (multiple
//     attendees reuse one share link).
//   - Invalidated when the room is destroyed: the join flow verifies the room
//     still exists, so a token for a reclaimed room fails there.
//   - Invalidated on server restart: the secret defaults to a per-process random
//     value, matching the in-memory room lifecycle (§15, no persistence).

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const b64url = (buf) => buf.toString('base64url');

export function createTokenService({
  secret = randomBytes(32).toString('hex'),
  ttlHours = 24,
  now = Date.now
} = {}) {
  const defaultTtlMs = ttlHours * 60 * 60 * 1000;

  function sign(payloadB64) {
    return b64url(createHmac('sha256', secret).update(payloadB64).digest());
  }

  // Issue a reusable share token for a room.
  function issue(roomId, { ttlMs = defaultTtlMs } = {}) {
    const payload = { r: roomId, e: now() + ttlMs };
    const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)));
    return `${payloadB64}.${sign(payloadB64)}`;
  }

  // Verify a token. Returns { ok:true, roomId } or { ok:false, reason }.
  function verify(token) {
    if (typeof token !== 'string' || !token.includes('.')) {
      return { ok: false, reason: 'malformed' };
    }
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return { ok: false, reason: 'malformed' };

    const expectedSig = sign(payloadB64);
    if (!safeEqual(sig, expectedSig)) return { ok: false, reason: 'bad_signature' };

    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    if (typeof payload.e !== 'number' || payload.e <= now()) {
      return { ok: false, reason: 'expired' };
    }
    return { ok: true, roomId: payload.r };
  }

  return { issue, verify };
}

function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
