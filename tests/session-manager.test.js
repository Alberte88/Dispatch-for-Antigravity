import test from 'node:test';
import assert from 'node:assert';
import { SessionManager } from '../src/session-manager.js';

// sha256("123456") = 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92
// NOTE: test fixture only — never use "123456" as a real PIN
const VALID_HASH = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';

test('SessionManager locks by default', () => {
  const mgr = new SessionManager(VALID_HASH, 1000);
  assert.strictEqual(mgr.isAuthorized(), false);
});

test('SessionManager rejects invalid pin and accepts valid pin', () => {
  const mgr = new SessionManager(VALID_HASH, 1000);
  assert.strictEqual(mgr.verifyAndAuthorize('invalid'), false);
  assert.strictEqual(mgr.verifyAndAuthorize('123456'), true);
  assert.strictEqual(mgr.isAuthorized(), true);
});

test('SessionManager lock() instantly revokes authorization', () => {
  const mgr = new SessionManager(VALID_HASH, 60000);
  mgr.verifyAndAuthorize('123456');
  assert.strictEqual(mgr.isAuthorized(), true);
  mgr.lock();
  assert.strictEqual(mgr.isAuthorized(), false);
});

test('SessionManager expires after timeout', async () => {
  const mgr = new SessionManager(VALID_HASH, 1); // 1ms timeout
  mgr.verifyAndAuthorize('123456');
  assert.strictEqual(mgr.isAuthorized(), true);
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(mgr.isAuthorized(), false);
});

test('SessionManager constructor rejects invalid hashedPin', () => {
  assert.throws(() => new SessionManager('not-a-sha256'), /hashedPin must be/);
  assert.throws(() => new SessionManager(null), /hashedPin must be/);
  assert.throws(() => new SessionManager(undefined), /hashedPin must be/);
});

test('SessionManager rejects empty or non-string pin', () => {
  const mgr = new SessionManager(VALID_HASH, 1000);
  assert.strictEqual(mgr.verifyAndAuthorize(''), false);
  assert.strictEqual(mgr.verifyAndAuthorize(undefined), false);
});
