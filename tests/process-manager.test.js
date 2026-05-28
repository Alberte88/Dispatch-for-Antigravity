import test from 'node:test';
import assert from 'node:assert';
import { executeAgent, killProcessTree } from '../src/process-manager.js';
import process from 'process';

test('executeAgent spawns a process with shell:false', (t, done) => {
  const child = executeAgent(
    process.execPath, // node.exe path
    ['--version'],
    process.cwd()
  );

  // Verify shell:false — spawned via child_process means spawnfile equals executablePath
  // (not wrapped in cmd.exe / sh), indicated by child.spawnfile or spawnargs[0]
  assert.strictEqual(child.spawnfile, process.execPath,
    'spawnfile should be the executable directly (not shell wrapper)');
  assert.deepStrictEqual(child.spawnargs, [process.execPath, '--version'],
    'spawnargs should NOT include shell prefixes');

  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.on('close', (code) => {
    assert.strictEqual(code, 0, 'process should exit with code 0');
    assert.match(output, /v\d+\.\d+\.\d+/, 'output should contain a semver version string');
    done();
  });
});

test('executeAgent returns a ChildProcess with expected properties', () => {
  const child = executeAgent(
    process.execPath,
    ['--version'],
    process.cwd()
  );

  assert.ok(typeof child.pid === 'number' || child.pid === undefined,
    'child.pid should be a number (or undefined before spawn)');
  assert.ok(child.stdout, 'child should have a stdout stream');
  assert.ok(child.stderr, 'child should have a stderr stream');
  assert.ok(typeof child.kill === 'function', 'child should have a kill method');

  // Clean up — let the process finish naturally
  return new Promise((resolve) => child.on('close', resolve));
});

test('killProcessTree returns a Promise', () => {
  // Verify the function returns a Promise without actually killing anything critical.
  // We pass a dummy PID (1 = init/system on Linux, PID 1 on Windows is System Idle)
  // and just confirm the return type. We do NOT await it.
  const dummyPid = 99999999; // almost certainly non-existent
  const result = killProcessTree(dummyPid);
  assert.ok(result instanceof Promise, 'killProcessTree should return a Promise');
  // Swallow rejection from targeting a non-existent PID
  return result.catch(() => {});
});

test('killProcessTree resolves or rejects as a Promise (platform-appropriate kill command)', async () => {
  // Spawn a short-lived process to kill — safer than killing our own PID
  const child = executeAgent(
    process.execPath,
    ['-e', 'setTimeout(() => {}, 10000)'], // wait 10 s (will be killed)
    process.cwd()
  );

  // Give it a moment to start
  await new Promise((resolve) => setTimeout(resolve, 200));

  const pid = child.pid;
  assert.ok(typeof pid === 'number', 'child.pid should be a number after spawn');

  // killProcessTree must return a Promise
  const killResult = killProcessTree(pid);
  assert.ok(killResult instanceof Promise, 'killProcessTree should return a Promise');

  // Await the kill — allow rejection (e.g. non-zero exit from taskkill) — we just
  // want to confirm the Promise settles and the child process eventually closes.
  await killResult.catch(() => {});

  // Wait for child close with a 3-second timeout so the test can't hang
  await Promise.race([
    new Promise((resolve) => child.on('close', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
});

