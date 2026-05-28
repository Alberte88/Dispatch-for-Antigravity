import test from 'node:test';
import assert from 'node:assert';
import { validateWorkspacePath } from '../src/path-validator.js';
import path from 'path';

test('validateWorkspacePath permits valid subdirectories', () => {
  const root = path.resolve('./tests');
  const valid = path.resolve('./tests/path-validator.test.js');
  assert.strictEqual(validateWorkspacePath(valid, root), true);
});

test('validateWorkspacePath blocks path traversal out of root', () => {
  const root = path.resolve('./tests');
  const invalid = path.resolve('./tests/../package.json');
  assert.throws(() => validateWorkspacePath(invalid, root), /Path escapes workspace boundary/);
});
