#!/usr/bin/env node
/**
 * setup.js — Interactive first-run configurator for Dispatch for Antigravity
 *
 * Run: node setup.js
 *
 * This script:
 *  1. Prompts for your desired PIN
 *  2. Hashes it with SHA-256
 *  3. Writes a .env file ready to use
 */

import crypto from 'crypto';
import fs from 'fs';
import readline from 'readline';
import path from 'path';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

console.log('\n🚀  Dispatch for Antigravity — First-Run Setup\n');
console.log('This will create a .env file in the current directory.\n');

const token         = await ask('📱 Telegram Bot Token (from @BotFather): ');
const chatId        = await ask('💬 Your Telegram Chat ID (from @userinfobot): ');
const pin           = await ask('🔐 Choose a PIN (you will type this on your phone to unlock): ');
const workspaceRoot = await ask('📂 Workspace root directory (e.g. C:\\projects): ');
const defaultWs     = await ask('📂 Default workspace (must be inside root, e.g. C:\\projects\\my-app): ');
const agyPath       = await ask('🤖 Path to agy.exe [default: C:\\Users\\alber\\AppData\\Local\\agy\\bin\\agy.exe]: ');

const hashedPin     = crypto.createHash('sha256').update(pin, 'utf8').digest('hex');
const resolvedAgy   = agyPath.trim() || 'C:\\Users\\alber\\AppData\\Local\\agy\\bin\\agy.exe';

const envContent = `TELEGRAM_BOT_TOKEN=${token.trim()}
ALLOWED_CHAT_ID=${chatId.trim()}
HASHED_PIN=${hashedPin}
WORKSPACE_ROOT=${workspaceRoot.trim()}
DEFAULT_WORKSPACE=${defaultWs.trim()}
ANTIGRAVITY_PATH=${resolvedAgy}
`;

fs.writeFileSync(path.resolve('.env'), envContent, 'utf8');
rl.close();

console.log('\n✅  .env file created successfully!');
console.log(`🔐  Your PIN is hashed as: ${hashedPin}`);
console.log('\n▶️   Start the bot with: node index.js\n');
