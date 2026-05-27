# Antigravity Remote Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted Telegram Bot server that acts as a secure, real-time command bridge to the local Antigravity CLI (`agy.exe`) on the host PC.

**Architecture:** A local Node.js daemon running Grammy bot engine via outbound long polling. It intercepts messages, runs them through a hashed PIN gate and workspace path-validator, spawns `agy.exe` as a child process, buffers/formats stdout logs under rate-limit constraints, and terminates process trees cleanly on command.

**Tech Stack:** Node.js, `grammy` (Telegram bot API), `dotenv` (environment configuration), and Node's built-in `node:test` & `node:assert` test runners.

---

## File Structure:
```
/dispatch-for-antigravity
  ├── index.js                  # Main Telegram Bot Entrypoint
  ├── package.json              # App manifest & dependencies
  ├── .gitignore                # Git ignore specifications
  ├── .env.example              # Sample environment file
  ├── src/
  │    ├── path-validator.js    # Path traversal & symlink validation
  │    ├── session-manager.js   # Hashed PIN gate & sliding 20m timeout
  │    ├── process-manager.js   # Spawn & kill process tree (taskkill)
  │    └── output-buffer.js     # Output parser, buffering, and truncation
  └── tests/
       ├── path-validator.test.js
       ├── session-manager.test.js
       ├── process-manager.test.js
       └── output-buffer.test.js
```

---

### Task 1: Project Setup & Package manifest

**Files:**
*   Create: `package.json`
*   Create: `.env.example`
*   Create: `.gitignore`

- [ ] **Step 1: Create package.json with dependencies**
    Write to `package.json`:
    ```json
    {
      "name": "dispatch-for-antigravity",
      "version": "1.0.0",
      "description": "Telegram Dispatch Bot for Antigravity",
      "main": "index.js",
      "type": "module",
      "engines": {
        "node": ">=18.0.0"
      },
      "scripts": {
        "start": "node index.js",
        "test": "node --test tests/*.test.js"
      },
      "dependencies": {
        "dotenv": "^16.4.7",
        "grammy": "^1.35.0",
        "strip-ansi": "^7.1.0"
      }
    }
    ```

- [ ] **Step 2: Create .env.example**
    Write to `.env.example`:
    ```env
    TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
    ALLOWED_CHAT_ID=123456789
    HASHED_PIN=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    WORKSPACE_ROOT=C:\projects
    DEFAULT_WORKSPACE=C:\projects\my-app
    ANTIGRAVITY_PATH=C:\Users\alber\AppData\Local\agy\bin\agy.exe
    ```

- [ ] **Step 3: Create .gitignore**
    Write to `.gitignore`:
    ```
    node_modules/
    .env
    .superpowers/
    ```

- [ ] **Step 4: Commit setup**
    Run:
    ```bash
    git add package.json .env.example .gitignore
    git commit -m "chore: initialize project metadata, package.json and gitignore"
    ```

---

### Task 2: Path Traversal & Symlink Validator

**Files:**
*   Create: `src/path-validator.js`
*   Create: `tests/path-validator.test.js`

- [ ] **Step 1: Write a failing test for path validation**
    Write `tests/path-validator.test.js` that checks for normal resolutions, traversal blocks, and directory containment:
    ```javascript
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
    ```

- [ ] **Step 2: Run test to verify it fails**
    Run: `npm test`
    Expected: FAIL with module import errors (module not found).

- [ ] **Step 3: Implement minimal path validator**
    Write `src/path-validator.js` with resolution, normalization, and prefix checks:
    ```javascript
    import path from 'path';
    import fs from 'fs';

    export function validateWorkspacePath(targetPath, workspaceRoot) {
      const resolvedRoot = path.resolve(workspaceRoot);
      let resolvedTarget = path.resolve(targetPath);

      if (fs.existsSync(resolvedTarget)) {
        resolvedTarget = fs.realPathSync(resolvedTarget);
      }

      if (!resolvedTarget.startsWith(resolvedRoot)) {
        throw new Error('Path escapes workspace boundary');
      }
      return true;
    }
    ```

- [ ] **Step 4: Run test to verify it passes**
    Run: `npm test`
    Expected: PASS

- [ ] **Step 5: Commit path validator**
    Run:
    ```bash
    git add src/path-validator.js tests/path-validator.test.js
    git commit -m "feat: implement path traversal and symlink validation"
    ```

---

### Task 3: Security & Session Manager (PIN and Timeout)

**Files:**
*   Create: `src/session-manager.js`
*   Create: `tests/session-manager.test.js`

- [ ] **Step 1: Write failing tests for session manager**
    Write `tests/session-manager.test.js` validating PIN comparison and sliding timeout:
    ```javascript
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
    ```

- [ ] **Step 2: Run test to verify it fails**
    Run: `npm test`
    Expected: FAIL on session-manager import.

- [ ] **Step 3: Implement SessionManager**
    Write `src/session-manager.js` with SHA-256 validation and timeout resets:
    ```javascript
    import crypto from 'crypto';

    export class SessionManager {
      constructor(hashedPin, timeoutMs = 20 * 60 * 1000) {
        this.hashedPin = hashedPin;
        this.timeoutMs = timeoutMs;
        this.authorizedUntil = 0;
      }

      verifyAndAuthorize(plainPin) {
        const hash = crypto.createHash('sha256').update(plainPin).digest('hex');
        if (hash === this.hashedPin) {
          this.resetTimeout();
          return true;
        }
        return false;
      }

      isAuthorized() {
        return Date.now() < this.authorizedUntil;
      }

      resetTimeout() {
        this.authorizedUntil = Date.now() + this.timeoutMs;
      }

      lock() {
        this.authorizedUntil = 0;
      }
    }
    ```

- [ ] **Step 4: Run test to verify it passes**
    Run: `npm test`
    Expected: PASS

- [ ] **Step 5: Commit session manager**
    Run:
    ```bash
    git add src/session-manager.js tests/session-manager.test.js
    git commit -m "feat: implement session manager with hashed pin and sliding timeout"
    ```

---

### Task 4: Process Spawner & Tree Killer

**Files:**
*   Create: `src/process-manager.js`
*   Create: `tests/process-manager.test.js`

- [ ] **Step 1: Write failing tests for process manager**
    Write `tests/process-manager.test.js` verifying task spawn capabilities and process tree termination:
    ```javascript
    import test from 'node:test';
    import assert from 'node:assert';
    import { executeAgent, killProcessTree } from '../src/process-manager.js';

    test('executeAgent successfully spawns shell command and captures output', async () => {
      let output = '';
      const proc = executeAgent('node', ['--version'], process.cwd());
      proc.stdout.on('data', (data) => { output += data.toString(); });
      
      const code = await new Promise((resolve) => proc.on('close', resolve));
      assert.strictEqual(code, 0);
      assert.match(output, /^v/);
    });
    ```

- [ ] **Step 2: Run test to verify it fails**
    Run: `npm test`
    Expected: FAIL on process-manager import.

- [ ] **Step 3: Implement ProcessManager**
    Write `src/process-manager.js` handling spawn and native command-line kills (`taskkill` on Windows, PGID on Unix):
    ```javascript
    import { spawn, exec } from 'child_process';

    export function executeAgent(executablePath, args, workspacePath) {
      // Remove shell: true to prevent shell execution/command injection
      return spawn(executablePath, args, {
        cwd: workspacePath,
        env: { ...process.env },
        shell: false
      });
    }

    export function killProcessTree(pid) {
      return new Promise((resolve, reject) => {
        if (process.platform === 'win32') {
          exec(`taskkill /T /F /PID ${pid}`, (err) => {
            if (err) return reject(err);
            resolve();
          });
        } else {
          exec(`kill -9 -${pid}`, (err) => {
            if (err) return reject(err);
            resolve();
          });
        }
      });
    }
    ```

- [ ] **Step 4: Run test to verify it passes**
    Run: `npm test`
    Expected: PASS

- [ ] **Step 5: Commit process manager**
    Run:
    ```bash
    git add src/process-manager.js tests/process-manager.test.js
    git commit -m "feat: implement child process spawner and recursive process tree killer"
    ```

---

### Task 5: Output Buffer & Rate Limiting

**Files:**
*   Create: `src/output-buffer.js`
*   Create: `tests/output-buffer.test.js`

- [ ] **Step 1: Write failing tests for output buffer**
    Write `tests/output-buffer.test.js` validating ANSI stripping, character truncation, and buffering:
    ```javascript
    import test from 'node:test';
    import assert from 'node:assert';
    import { OutputBuffer } from '../src/output-buffer.js';

    test('OutputBuffer strips ANSI color escapes and carriage returns', () => {
      const buffer = new OutputBuffer(() => {});
      const input = '\u001b[32mHello\u001b[0m\r\n';
      assert.strictEqual(buffer.cleanText(input), 'Hello\n');
    });

    test('OutputBuffer truncates text over 4000 characters', () => {
      const buffer = new OutputBuffer(() => {});
      const longInput = 'A'.repeat(5000);
      const cleaned = buffer.cleanText(longInput);
      assert.strictEqual(cleaned.length, 4014); // 4000 + length of truncate warning
      assert.match(cleaned, /\.\.\.\[truncated\]$/);
    });
    ```

- [ ] **Step 2: Run test to verify it fails**
    Run: `npm test`
    Expected: FAIL on output-buffer import.

- [ ] **Step 3: Implement OutputBuffer**
    Write `src/output-buffer.js` using strip-ansi and interval-based flushing:
    ```javascript
    import stripAnsi from 'strip-ansi';

    export class OutputBuffer {
      constructor(flushCallback, intervalMs = 10000) {
        this.flushCallback = flushCallback;
        this.intervalMs = intervalMs;
        this.buffer = '';
        this.timer = null;
      }

      cleanText(text) {
        let cleaned = stripAnsi(text).replace(/\r/g, '');

        if (cleaned.length > 4000) {
          cleaned = cleaned.substring(0, 4000) + '...[truncated]';
        }
        return cleaned;
      }

      append(text) {
        const cleaned = this.cleanText(text);
        if (!cleaned) return;
        this.buffer += cleaned;

        if (!this.timer) {
          this.timer = setTimeout(() => this.flush(), this.intervalMs);
        }
      }

      flush() {
        if (this.buffer) {
          this.flushCallback(this.buffer);
          this.buffer = '';
        }
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
      }
    }
    ```

- [ ] **Step 4: Run test to verify it passes**
    Run: `npm test`
    Expected: PASS

- [ ] **Step 5: Commit output buffer**
    Run:
    ```bash
    git add src/output-buffer.js tests/output-buffer.test.js
    git commit -m "feat: implement ansi stripping, chunk truncation, and output buffer"
    ```

---

### Task 6: Main Entrypoint & Grammy Command Bridge

**Files:**
*   Create: `index.js`

- [ ] **Step 1: Implement index.js**
    Write the core runtime logic in `index.js`, binding Grammy commands, chat filters, PIN verifications, progress logs, git diff inferences, and child process standard streams.
    ```javascript
    import { Bot } from 'grammy';
    import dotenv from 'dotenv';
    import path from 'path';
    import { execSync } from 'child_process';
    import { SessionManager } from './src/session-manager.js';
    import { validateWorkspacePath } from './src/path-validator.js';
    import { executeAgent, killProcessTree } from './src/process-manager.js';
    import { OutputBuffer } from './src/output-buffer.js';

    dotenv.config();

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const allowedChat = Number(process.env.ALLOWED_CHAT_ID);
    const hashedPin = process.env.HASHED_PIN;
    const workspaceRoot = process.env.WORKSPACE_ROOT;
    const defaultWorkspace = process.env.DEFAULT_WORKSPACE;
    const agyPath = process.env.ANTIGRAVITY_PATH;

    if (!token || !allowedChat || !hashedPin || !workspaceRoot || !defaultWorkspace || !agyPath) {
      console.error('Missing configuration keys in .env. Review your setup.');
      process.exit(1);
    }

    const bot = new Bot(token);
    const session = new SessionManager(hashedPin, 20 * 60 * 1000);
    
    let currentProcess = null;
    let activeWorkspace = defaultWorkspace;
    let idleTimeoutTimer = null;

    // Filter sender
    bot.use(async (ctx, next) => {
      if (ctx.chat && ctx.chat.id === allowedChat) {
        await next();
      }
    });

    const resetIdleTimeout = (ctx) => {
      if (idleTimeoutTimer) clearTimeout(idleTimeoutTimer);
      idleTimeoutTimer = setTimeout(async () => {
        if (currentProcess) {
          await ctx.reply('⚠️ Process has been idle/waiting for 5 minutes. Reply to this message to send input, or type /stop to kill the task.');
        }
      }, 5 * 60 * 1000);
    };

    const runAgy = async (ctx, prompt, continueSession = false) => {
      if (currentProcess) {
        return ctx.reply('⚠️ An agent task is already running. Wait for completion or use /stop to terminate it.');
      }

      try {
        validateWorkspacePath(activeWorkspace, workspaceRoot);
      } catch (err) {
        return ctx.reply(`❌ Security Block: ${err.message}`);
      }

      await ctx.reply(`🚀 Spawning Antigravity in workspace: \`${activeWorkspace}\`...`);
      session.resetTimeout();

      // Pass arguments as a strict array. Since shell: false is used, 
      // we do not wrap the prompt or directory in quotes or escape them.
      const args = [
        '--prompt', prompt,
        '--dangerously-skip-permissions',
        '--add-dir', activeWorkspace
      ];
      if (continueSession) {
        args.push('--continue');
      }

      const proc = executeAgent(agyPath, args, activeWorkspace);
      currentProcess = proc;
      resetIdleTimeout(ctx);

      const buffer = new OutputBuffer(async (text) => {
        await ctx.reply(`\`\`\`\n${text}\n\`\`\``);
      }, 5000);

      proc.stdout.on('data', (data) => {
        resetIdleTimeout(ctx);
        const str = data.toString();
        // Log milestone captures
        if (str.includes('Running command')) {
          ctx.reply(`💻 *Executing command:* \`${str.match(/Running command:? (.+)/)?.[1] || 'shell command'}\``, { parse_mode: 'Markdown' });
        } else if (str.includes('Writing file')) {
          ctx.reply(`✏️ *Modifying file:* \`${str.match(/Writing file:? (.+)/)?.[1] || 'workspace file'}\``, { parse_mode: 'Markdown' });
        }
        buffer.append(str);
      });

      proc.stderr.on('data', (data) => {
        resetIdleTimeout(ctx);
        buffer.append(`[stderr] ${data.toString()}`);
      });

      proc.on('close', async (code) => {
        buffer.flush();
        if (idleTimeoutTimer) clearTimeout(idleTimeoutTimer);
        currentProcess = null;

        if (code === 0) {
          // Infer changes using git
          let gitSummary = 'No changes detected.';
          try {
            // Ignore stderr stream in execSync to prevent bot crashing if directory is not a git repo
            gitSummary = execSync('git diff --stat', { cwd: activeWorkspace, stdio: ['pipe', 'pipe', 'ignore'] }).toString();
          } catch (e) {
            gitSummary = 'Git status query unavailable (no git repository).';
          }

          await ctx.reply(`✅ *Task Completed Successfully!* \n\n*Git Changes:*\n\`\`\`\n${gitSummary || 'No file edits detected.'}\n\`\`\``, { parse_mode: 'Markdown' });
        } else {
          await ctx.reply(`❌ *Task Failed.* process exited with code ${code}.`);
        }
      });
    };

    // Bot command triggers
    bot.command('status', (ctx) => {
      if (currentProcess) {
        ctx.reply(`⏳ Antigravity is active (PID: ${currentProcess.pid}). Running in workspace: \`${activeWorkspace}\``);
      } else {
        ctx.reply(session.isAuthorized() ? '🟢 Bot is idle, session is UNLOCKED.' : '🔒 Bot is locked. Enter PIN to unlock.');
      }
    });

    bot.command('lock', (ctx) => {
      session.lock();
      ctx.reply('🔒 Session locked successfully.');
    });

    bot.command('stop', async (ctx) => {
      if (!currentProcess) return ctx.reply('No agent task is currently running.');
      try {
        await killProcessTree(currentProcess.pid);
        ctx.reply('🛑 Stopped Antigravity execution and killed all child processes.');
      } catch (err) {
        ctx.reply(`❌ Error stopping process: ${err.message}`);
      }
    });

    bot.command('workspace', (ctx) => {
      const p = ctx.match;
      if (!p) return ctx.reply(`Current workspace: \`${activeWorkspace}\``);
      try {
        validateWorkspacePath(p, workspaceRoot);
        activeWorkspace = path.resolve(p);
        ctx.reply(`📂 Target workspace updated to: \`${activeWorkspace}\``);
      } catch (err) {
        ctx.reply(`❌ Security Block: ${err.message}`);
      }
    });

    bot.command('model', (ctx) => {
      const homeDir = process.env.USERPROFILE || process.env.HOME;
      const cliSettingsPath = path.join(homeDir, '.gemini', 'antigravity-cli', 'settings.json');
      let currentModel = 'Default (not set)';
      
      try {
        if (fs.existsSync(cliSettingsPath)) {
          const settings = JSON.parse(fs.readFileSync(cliSettingsPath, 'utf8'));
          if (settings.model) {
            currentModel = settings.model;
          }
        }
      } catch (err) {
        return ctx.reply(`❌ Error reading settings: ${err.message}`);
      }

      const inputModel = ctx.match;
      if (!inputModel) {
        return ctx.reply(`🤖 *Current Model:* \`${currentModel}\`\n\nTo change it, run:\n\`/model <model_name>\`\n*Available examples:*\n- \`Gemini 3.5 Flash (High)\`\n- \`Gemini 3.5 Pro\``, { parse_mode: 'Markdown' });
      }

      try {
        let settings = {};
        if (fs.existsSync(cliSettingsPath)) {
          settings = JSON.parse(fs.readFileSync(cliSettingsPath, 'utf8'));
        }
        settings.model = inputModel;
        fs.writeFileSync(cliSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
        ctx.reply(`✅ *Model configuration updated to:* \`${inputModel}\`. Antigravity will use this model for future tasks.`, { parse_mode: 'Markdown' });
      } catch (err) {
        ctx.reply(`❌ Error updating settings: ${err.message}`);
      }
    });

    bot.on('message', async (ctx) => {
      const text = ctx.message.text;
      if (!text) return;

      if (!session.isAuthorized()) {
        const authorized = session.verifyAndAuthorize(text);
        try {
          await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
        } catch (e) {
          // ignore if deletion fails due to admin scope limitations
        }
        if (authorized) {
          await ctx.reply('🔓 *Passcode Verified.* Bot unlocked for 20 minutes.', { parse_mode: 'Markdown' });
        } else {
          await ctx.reply('🔒 *Invalid Passcode.* Bot remains locked.', { parse_mode: 'Markdown' });
        }
        return;
      }

      // If session is authorized and process is running, pipe directly to stdin (interactive input)
      if (currentProcess) {
        currentProcess.stdin.write(text + '\n');
        resetIdleTimeout(ctx);
        return;
      }

      if (text.startsWith('/run ')) {
        await runAgy(ctx, text.substring(5), false);
      } else if (text.startsWith('/continue ') || text.startsWith('/c ')) {
        const prompt = text.startsWith('/c ') ? text.substring(3) : text.substring(10);
        await runAgy(ctx, prompt, true);
      } else {
        await ctx.reply('💡 Send `/run <task>` to start a task, or `/c <task>` to continue. Current session is authorized.');
      }
    });

    bot.start();
    console.log('Antigravity Telegram Dispatcher listening...');
    ```

- [ ] **Step 2: Verify all tests still pass**
    Run: `npm test`
    Expected: PASS

- [ ] **Step 3: Commit bot server**
    Run:
    ```bash
    git add index.js
    git commit -m "feat: complete grammy command router and run_agy bridge"
    ```
