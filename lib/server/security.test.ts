import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
  sanitizeCsvCell,
  isValidSafeUrl,
} from './security';

test('hashes and verifies passwords via scrypt without plaintext leakage', () => {
  const hash = hashPassword('JuneberryTest#2026');
  assert.ok(hash.includes(':'));
  assert.equal(verifyPassword('JuneberryTest#2026', hash), true);
  assert.equal(verifyPassword('WrongPassword', hash), false);
});

test('signs and verifies HMAC Bearer tokens and rejects tampering', () => {
  const token = signSessionToken({
    sub: 'prof_1',
    role: 'student',
    email: 'student@juneberry.edu.ng',
  });
  const verified = verifySessionToken(token);
  assert.ok(verified);
  assert.equal(verified?.sub, 'prof_1');
  assert.equal(verified?.role, 'student');

  const tampered = `${token.slice(0, -4)}xxxx`;
  assert.equal(verifySessionToken(tampered), null);
});

test('sanitizes CSV cells against formula injection and validates safe URLs', () => {
  assert.equal(sanitizeCsvCell('=CMD|"/c calc"!A0'), `"'=CMD|""/c calc""!A0"`);
  assert.equal(isValidSafeUrl('javascript:alert(1)'), false);
  assert.equal(isValidSafeUrl('/images/diagram_plant_cell.jpg'), true);
});
