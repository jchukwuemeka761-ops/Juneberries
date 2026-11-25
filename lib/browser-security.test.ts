import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  isValidSafeUrl,
  sanitizeCsvCell,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from './browser-security.ts';

test('hashes and verifies passwords with random salt without plaintext leakage', () => {
  const hash = hashPassword('Juneberries!2026');
  assert.ok(!hash.includes('Juneberries!2026'));
  assert.equal(verifyPassword('Juneberries!2026', hash), true);
  assert.equal(verifyPassword('WrongPassword', hash), false);
});

test('signs and verifies session tokens and rejects tampering', () => {
  const token = signSessionToken({
    sub: 'prof_123',
    role: 'super_admin',
    email: 'admin@juneberries.edu.ng',
  });
  const payload = verifySessionToken(token);
  assert.equal(payload?.sub, 'prof_123');
  assert.equal(payload?.role, 'super_admin');
  assert.equal(verifySessionToken(`${token}tampered`), null);
});

test('sanitizes CSV cells against formula injection and validates safe URLs', () => {
  assert.equal(sanitizeCsvCell('=CMD("calc")'), '"\'=CMD(""calc"")"');
  assert.equal(sanitizeCsvCell('+1+2'), '\'+1+2');
  assert.equal(sanitizeCsvCell('Normal, Text'), '"Normal, Text"');
  assert.equal(isValidSafeUrl('javascript:alert(1)'), false);
  assert.equal(isValidSafeUrl('/images/diagram_plant_cell.jpg'), true);
});
