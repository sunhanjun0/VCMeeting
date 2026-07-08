// Password hashing (salted scrypt). Room passwords are stored only as `salt:hash`
// (TDD §4 passwordHash). Verification is constant-time.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEYLEN = 32;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, KEYLEN);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(password), salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
