/**
 * process-manager.js
 *
 * Execution engine for spawning agy.exe child processes and killing their
 * entire process trees on demand.
 *
 * Security note: shell:false is MANDATORY throughout this module to prevent
 * command injection. Never set shell:true here.
 */

import { spawn } from 'child_process';

/**
 * Spawn the agent executable as a child process.
 *
 * @param {string} executablePath - Absolute path to the executable (e.g. agy.exe).
 * @param {string[]} args         - Array of CLI arguments to pass to the executable.
 * @param {string} workspacePath  - Working directory for the spawned process.
 * @returns {import('child_process').ChildProcess}
 */
export function executeAgent(executablePath, args, workspacePath) {
  return spawn(executablePath, args, {
    shell: false,            // CRITICAL: prevents command injection
    cwd: workspacePath,
    env: { ...process.env }, // inherit environment from parent
  });
}

/**
 * Kill an entire process tree rooted at the given PID.
 *
 * On Windows this uses `taskkill /T /F /PID <pid>` which recursively
 * terminates all child processes.  On POSIX systems the process group is
 * killed with SIGKILL.
 *
 * @param {number} pid - PID of the root process to terminate.
 * @returns {Promise<void>} Resolves when the kill command exits.
 */
export function killProcessTree(pid) {
  return new Promise((resolve, reject) => {
    let killer;

    if (process.platform === 'win32') {
      // /T — terminate the process and its entire tree
      // /F — force termination (no graceful shutdown dialog)
      killer = spawn('taskkill', ['/T', '/F', '/PID', String(pid)], {
        shell: false, // security: do not wrap in cmd.exe
      });
    } else {
      // Send SIGKILL to the whole process group (negative PID = group id)
      killer = spawn('kill', ['-9', `-${pid}`], {
        shell: false,
      });
    }

    killer.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`kill command exited with code ${code} for PID ${pid}`));
      }
    });

    killer.on('error', (err) => {
      reject(err);
    });
  });
}
