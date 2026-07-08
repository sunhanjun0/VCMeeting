import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTokenService } from './token.js';

function withClock() {
  let t = 1_000_000;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('issue + verify: valid token resolves to its roomId', () => {
  const svc = createTokenService({ secret: 'test-secret' });
  const token = svc.issue('room-abc');
  const res = svc.verify(token);
  assert.equal(res.ok, true);
  assert.equal(res.roomId, 'room-abc');
});

test('non-one-time: same token verifies repeatedly', () => {
  const svc = createTokenService({ secret: 'test-secret' });
  const token = svc.issue('room-abc');
  assert.equal(svc.verify(token).ok, true);
  assert.equal(svc.verify(token).ok, true);
  assert.equal(svc.verify(token).ok, true);
});

test('expired token fails after TTL', () => {
  const clock = withClock();
  const svc = createTokenService({ secret: 'test-secret', ttlHours: 24, now: clock.now });
  const token = svc.issue('room-abc');
  clock.advance(24 * 60 * 60 * 1000 + 1); // just past 24h
  const res = svc.verify(token);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'expired');
});

test('configurable TTL per issue', () => {
  const clock = withClock();
  const svc = createTokenService({ secret: 'test-secret', now: clock.now });
  const token = svc.issue('room-abc', { ttlMs: 1000 });
  clock.advance(500);
  assert.equal(svc.verify(token).ok, true);
  clock.advance(600); // total 1100 > 1000
  assert.equal(svc.verify(token).ok, false);
});

test('tampered signature is rejected', () => {
  const svc = createTokenService({ secret: 'test-secret' });
  const token = svc.issue('room-abc');
  const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
  const res = svc.verify(tampered);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'bad_signature');
});

test('token from a different secret is rejected', () => {
  const a = createTokenService({ secret: 'secret-a' });
  const b = createTokenService({ secret: 'secret-b' });
  const token = a.issue('room-abc');
  assert.equal(b.verify(token).ok, false);
});

test('malformed tokens are rejected', () => {
  const svc = createTokenService({ secret: 'test-secret' });
  assert.equal(svc.verify('').ok, false);
  assert.equal(svc.verify('no-dot').ok, false);
  assert.equal(svc.verify('a.').ok, false);
  assert.equal(svc.verify(null).ok, false);
});
