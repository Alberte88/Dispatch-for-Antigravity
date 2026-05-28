import test from 'node:test';
import assert from 'node:assert';
import { OutputBuffer } from '../src/output-buffer.js';

function makeSender() {
  const sent = [];
  const fn = async (msg) => sent.push(msg);
  fn.sent = sent;
  return fn;
}

test('OutputBuffer strips ANSI escape codes', async () => {
  const sender = makeSender();
  const buf = new OutputBuffer(sender, { chunkSize: 3800, flushMs: 50 });
  buf.feed('\u001b[32mHello\u001b[0m World');
  await buf.flush(true);
  assert.strictEqual(sender.sent.length, 1);
  assert.strictEqual(sender.sent[0], 'Hello World');
  buf.dispose();
});

test('OutputBuffer splits output into chunks at chunkSize boundary', async () => {
  const sender = makeSender();
  const buf = new OutputBuffer(sender, { chunkSize: 10, flushMs: 50 });
  buf.feed('1234567890ABCDE'); // 15 chars, chunkSize=10 → 2 messages
  await buf.flush(true);
  assert.strictEqual(sender.sent.length, 2);
  assert.strictEqual(sender.sent[0], '1234567890');
  assert.strictEqual(sender.sent[1], 'ABCDE');
  buf.dispose();
});

test('OutputBuffer accumulates multiple feeds before flush', async () => {
  const sender = makeSender();
  const buf = new OutputBuffer(sender, { chunkSize: 3800, flushMs: 50 });
  buf.feed('Hello ');
  buf.feed('World');
  await buf.flush(true);
  assert.strictEqual(sender.sent.length, 1);
  assert.strictEqual(sender.sent[0], 'Hello World');
  buf.dispose();
});

test('OutputBuffer auto-flushes after flushMs', async () => {
  const sender = makeSender();
  const buf = new OutputBuffer(sender, { chunkSize: 3800, flushMs: 20 });
  buf.feed('auto-flush test');
  // Wait longer than flushMs for the timer to fire
  await new Promise(r => setTimeout(r, 60));
  assert.strictEqual(sender.sent.length, 1);
  assert.strictEqual(sender.sent[0], 'auto-flush test');
  buf.dispose();
});

test('OutputBuffer flush on empty buffer sends nothing', async () => {
  const sender = makeSender();
  const buf = new OutputBuffer(sender, { chunkSize: 3800, flushMs: 50 });
  await buf.flush(true);
  assert.strictEqual(sender.sent.length, 0);
  buf.dispose();
});

test('OutputBuffer dispose cancels pending auto-flush', async () => {
  const sender = makeSender();
  const buf = new OutputBuffer(sender, { chunkSize: 3800, flushMs: 20 });
  buf.feed('should not send');
  buf.dispose();
  // Wait past flushMs to confirm timer was cancelled
  await new Promise(r => setTimeout(r, 60));
  assert.strictEqual(sender.sent.length, 0);
});
