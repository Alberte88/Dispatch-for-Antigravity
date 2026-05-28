import test from 'node:test';
import assert from 'node:assert';
import { SessionManager } from '../src/session-manager.js';

test('SessionManager locks by default', () => {
  const mgr = new SessionManager('hashed_dummy', 1000);
  assert.strictEqual(mgr.isAuthorized(), false);
});

test('SessionManager rejects invalid pin and accepts valid pin', () => {
  // sha256("123456") = 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92
  const hashed = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
  const mgr = new SessionManager(hashed, 1000);
  assert.strictEqual(mgr.verifyAndAuthorize('invalid'), false);
  assert.strictEqual(mgr.verifyAndAuthorize('123456'), true);
  assert.strictEqual(mgr.isAuthorized(), true);
});
