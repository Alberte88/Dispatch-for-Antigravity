import { Bot } from 'grammy';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { SessionManager } from './src/session-manager.js';
import { validateWorkspacePath } from './src/path-validator.js';
import { executeAgent, killProcessTree } from './src/process-manager.js';
import { OutputBuffer } from './src/output-buffer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

// ─── Config & startup validation ───────────────────────────────────────────
const token          = process.env.TELEGRAM_BOT_TOKEN;
const allowedChat    = Number(process.env.ALLOWED_CHAT_ID);
const hashedPin      = process.env.HASHED_PIN;
const workspaceRoot  = process.env.WORKSPACE_ROOT;
const defaultWs      = process.env.DEFAULT_WORKSPACE;
const agyPath        = process.env.ANTIGRAVITY_PATH;
// Reports directory: use env var if set, otherwise fall back to Google Drive, then local 'reports' folder
const reportsDir     = process.env.REPORTS_DIR
  || 'G:\\My Drive\\Antigravity Reports';

if (!token || !allowedChat || !hashedPin || !workspaceRoot || !defaultWs || !agyPath) {
  console.error('❌  Missing required .env keys. Copy .env.example and fill in all values.');
  process.exit(1);
}

// Ensure reports directory exists at startup
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
  console.log(`📁  Created reports directory: ${reportsDir}`);
}
console.log(`📁  Reports folder: ${reportsDir}`);

const cliSettingsPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.gemini', 'antigravity-cli', 'settings.json'
);

// ─── State ─────────────────────────────────────────────────────────────────
const bot            = new Bot(token);
const session        = new SessionManager(hashedPin, 20 * 60 * 1000);
let currentProcess   = null;
let activeWorkspace  = path.resolve(defaultWs);
let idleTimer        = null;

// ─── Helpers ───────────────────────────────────────────────────────────────
function escapeHTML(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function resetIdleTimer(ctx) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (currentProcess) {
      await ctx.reply('⚠️ Process has been idle for 5 minutes. Reply to send input, or /stop to kill it.');
    }
  }, 5 * 60 * 1000);
}

async function runAgy(ctx, prompt, continueSession = false) {
  if (currentProcess) {
    return ctx.reply('⚠️ A task is already running. Wait for it to finish or use /stop.');
  }

  try {
    validateWorkspacePath(activeWorkspace, workspaceRoot);
  } catch (err) {
    return ctx.reply(`❌ Security Block: ${err.message}`);
  }

  // reportsDir is initialised at startup (top of file) — already guaranteed to exist

  await ctx.reply(`🚀 Starting Antigravity in \`${activeWorkspace}\`…`, { parse_mode: 'Markdown' });
  session.resetTimeout();

  // Instruct the agent to save any generated reports/documents in the reports directory
  const systemInstruction = `\n\n[System Instruction: If you generate any report, document, text summary, analysis, or export file, you MUST write it directly to the designated reports folder: "${reportsDir}". Write the file there using a clear, descriptive name (e.g. "budget_analysis.md"), and mention the file path in your final response.]`;
  const finalPrompt = prompt + systemInstruction;

  // Arguments passed as a strict array — shell:false means no injection risk
  const args = [
    '--prompt', finalPrompt,
    '--dangerously-skip-permissions',
    '--add-dir', activeWorkspace,
  ];
  if (continueSession) args.push('--continue');

  const proc = executeAgent(agyPath, args, activeWorkspace);
  currentProcess = proc;
  resetIdleTimer(ctx);

  // Wire stdin and immediately close it so the process knows no more input is coming (prevents hanging)
  proc.stdin?.setEncoding('utf8');
  proc.stdin?.end();

  const buffer = new OutputBuffer(
    async (text) => ctx.reply(`<pre><code>${escapeHTML(text)}</code></pre>`, { parse_mode: 'HTML' }),
    { chunkSize: 3800, flushMs: 5000 }
  );

  proc.stdout?.on('data', (data) => {
    resetIdleTimer(ctx);
    const str = data.toString();

    // Surface key milestones as inline status messages
    const cmdMatch = str.match(/Running command:? (.+)/);
    if (cmdMatch) ctx.reply(`💻 <code>${escapeHTML(cmdMatch[1].trim())}</code>`, { parse_mode: 'HTML' });

    const fileMatch = str.match(/Writing file:? (.+)/);
    if (fileMatch) ctx.reply(`✏️ <code>${escapeHTML(fileMatch[1].trim())}</code>`, { parse_mode: 'HTML' });

    buffer.feed(str);
  });

  proc.stderr?.on('data', (data) => {
    resetIdleTimer(ctx);
    buffer.feed(`[stderr] ${data.toString()}`);
  });

  proc.on('close', async (code) => {
    await buffer.flush(true);
    clearTimeout(idleTimer);
    currentProcess = null;

    if (code === 0) {
      let gitSummary = 'No changes detected.';
      try {
        const raw = execSync('git diff --stat HEAD', {
          cwd: activeWorkspace,
          stdio: ['pipe', 'pipe', 'ignore'],
        }).toString().trim();
        if (raw) gitSummary = raw;
      } catch {
        gitSummary = '(Not a git repository or no staged changes)';
      }
      await ctx.reply(
        `✅ <b>Task complete!</b>\n\n<b>Changes:</b>\n<pre><code>${escapeHTML(gitSummary)}</code></pre>`,
        { parse_mode: 'HTML' }
      );
    } else {
      await ctx.reply(`❌ Task exited with code ${code}.`);
    }
  });
}

// ─── Middleware: restrict to allowed chat ──────────────────────────────────
bot.use(async (ctx, next) => {
  console.log(`📥 Update received from chat ${ctx.chat?.id}:`, ctx.message?.text || '(non-text update)');
  if (ctx.chat?.id === allowedChat) {
    console.log('✅ Chat ID matches allowedChat, proceeding...');
    await next();
  } else {
    console.log(`❌ Chat ID ${ctx.chat?.id} does not match allowedChat ${allowedChat}`);
  }
});

// ─── Commands ──────────────────────────────────────────────────────────────
bot.command('status', (ctx) => {
  if (currentProcess) {
    return ctx.reply(`⏳ Running (PID: ${currentProcess.pid}) in \`${activeWorkspace}\``, { parse_mode: 'Markdown' });
  }
  return ctx.reply(
    session.isAuthorized()
      ? `🟢 Idle — session unlocked.\nWorkspace: \`${activeWorkspace}\``
      : '🔒 Bot locked. Send your PIN to unlock.',
    { parse_mode: 'Markdown' }
  );
});

bot.command('lock', (ctx) => {
  session.lock();
  return ctx.reply('🔒 Session locked.');
});

bot.command('stop', async (ctx) => {
  if (!currentProcess) return ctx.reply('No task is currently running.');
  try {
    await killProcessTree(currentProcess.pid);
    return ctx.reply('🛑 Stopped Antigravity and all child processes.');
  } catch (err) {
    return ctx.reply(`❌ Stop failed: ${err.message}`);
  }
});

bot.command('workspace', (ctx) => {
  const arg = ctx.match?.trim();
  if (!arg) return ctx.reply(`📂 Current workspace: \`${activeWorkspace}\``, { parse_mode: 'Markdown' });
  try {
    validateWorkspacePath(arg, workspaceRoot);
    activeWorkspace = path.resolve(arg);
    return ctx.reply(`📂 Workspace set to: \`${activeWorkspace}\``, { parse_mode: 'Markdown' });
  } catch (err) {
    return ctx.reply(`❌ Security Block: ${err.message}`);
  }
});

bot.command('model', (ctx) => {
  const arg = ctx.match?.trim();
  let currentModel = 'Default (not configured)';

  try {
    if (fs.existsSync(cliSettingsPath)) {
      const settings = JSON.parse(fs.readFileSync(cliSettingsPath, 'utf8'));
      if (settings.model) currentModel = settings.model;
    }
  } catch (err) {
    return ctx.reply(`❌ Error reading settings: ${err.message}`);
  }

  if (!arg) {
    return ctx.reply(
      `🤖 *Current model:* \`${currentModel}\`\n\nTo switch, send:\n\`/model <model_name>\`\n\n*Examples:*\n• \`gemini-2.5-flash-preview-05-20\`\n• \`gemini-2.5-pro-preview-05-06\``,
      { parse_mode: 'Markdown' }
    );
  }

  try {
    let settings = {};
    if (fs.existsSync(cliSettingsPath)) {
      settings = JSON.parse(fs.readFileSync(cliSettingsPath, 'utf8'));
    }
    settings.model = arg;
    fs.writeFileSync(cliSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
    return ctx.reply(`✅ Model switched to \`${arg}\`.`, { parse_mode: 'Markdown' });
  } catch (err) {
    return ctx.reply(`❌ Error updating settings: ${err.message}`);
  }
});

bot.command('help', (ctx) => ctx.reply(
  `*Antigravity Dispatch Bot*\n\n` +
  `🔐 *Auth*\n` +
  `Send your PIN to unlock (20-min sliding session)\n` +
  `/lock — Lock session immediately\n\n` +
  `🚀 *Running tasks* (requires unlock)\n` +
  `/run \`<task>\` — Start a new Antigravity task\n` +
  `/c \`<task>\` — Continue previous Antigravity session\n` +
  `/stop — Kill running task and all child processes\n\n` +
  `📂 *Workspace*\n` +
  `/workspace — Show current workspace\n` +
  `/workspace \`<path>\` — Switch workspace (must be inside \`WORKSPACE_ROOT\`)\n\n` +
  `🤖 *Model*\n` +
  `/model — Show current model\n` +
  `/model \`<name>\` — Switch model in \`settings.json\`\n\n` +
  `📊 *Status*\n` +
  `/status — Show bot state`,
  { parse_mode: 'Markdown' }
));

// ─── Message handler: PIN gate → stdin passthrough → /run shorthand ────────
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;

  // Skip command messages (already handled above)
  if (text.startsWith('/')) return;

  const wasAuthorized = session.isAuthorized();
  const pinVerified = session.verifyAndAuthorize(text);

  if (pinVerified) {
    // Best-effort: delete PIN message to keep chat history clean
    try { await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch { /* ignore */ }
    return ctx.reply(
      wasAuthorized
        ? '🔓 *Already unlocked!* Session active for another 20 minutes.'
        : '🔓 *Unlocked!* Session active for 20 minutes.',
      { parse_mode: 'Markdown' }
    );
  }

  // If not authorized and PIN verification failed
  if (!wasAuthorized) {
    try { await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch { /* ignore */ }
    return ctx.reply('🔒 *Wrong PIN.* Try again.', { parse_mode: 'Markdown' });
  }

  // If a process is running, pipe plain text as stdin input
  if (currentProcess) {
    currentProcess.stdin?.write(text + '\n');
    resetIdleTimer(ctx);
    return;
  }

  // Plain English shorthand: treat any non-command authorized text as a /run prompt
  await runAgy(ctx, text, false);
});

// ─── Error Handling ────────────────────────────────────────────────────────
bot.catch((err) => {
  console.error('⚠️  Error in bot middleware:', err.error || err);
});

// ─── Start ─────────────────────────────────────────────────────────────────
bot.start();
console.log('✅  Antigravity Telegram Dispatcher is running…');
