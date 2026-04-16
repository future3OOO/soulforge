/**
 * PID file tracker for LSP child processes.
 *
 * Writes spawned LSP PIDs to ~/.soulforge/lsp-pids.json so they can be
 * cleaned up on next startup — even after crashes, SIGKILL, or any exit
 * path that bypasses normal cleanup.
 *
 * This is the last line of defense against orphaned LSP processes.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PID_FILE = join(homedir(), ".soulforge", "lsp-pids.json");

/** In-memory set of PIDs we've spawned this session */
const activePids = new Set<number>();

function ensureDir(): void {
  const dir = join(homedir(), ".soulforge");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function flush(): void {
  try {
    ensureDir();
    // Atomic write: write to temp file then rename to avoid corruption
    // if main thread and worker thread flush concurrently.
    const tmp = `${PID_FILE}.${String(process.pid)}.tmp`;
    writeFileSync(tmp, JSON.stringify([...activePids]), "utf-8");
    renameSync(tmp, PID_FILE);
  } catch {
    // Best effort — never crash the app over bookkeeping
  }
}

/** Record a newly spawned LSP process */
export function trackLspPid(pid: number): void {
  activePids.add(pid);
  flush();
}

/** Remove a PID when the process exits normally */
export function untrackLspPid(pid: number): void {
  activePids.delete(pid);
  flush();
}

/** Kill all PIDs recorded in the PID file (from previous sessions) */
export function reapOrphanedLspProcesses(): number {
  let killed = 0;
  let stale: number[] = [];
  try {
    if (!existsSync(PID_FILE)) return 0;
    const raw = readFileSync(PID_FILE, "utf-8");
    stale = JSON.parse(raw) as number[];
  } catch {
    return 0;
  }

  for (const pid of stale) {
    if (activePids.has(pid)) continue;
    try {
      // Signal 0 checks if process exists without killing it
      process.kill(pid, 0);
    } catch {
      // ESRCH = process doesn't exist — already dead, good
      continue;
    }
    // Verify the PID still belongs to an LSP-related process before killing.
    // PIDs can be reused by the OS — without this check we could SIGKILL
    // an innocent process that inherited the PID after the LSP died.
    if (!isLspProcess(pid)) continue;
    try {
      process.kill(-pid, "SIGKILL");
      killed++;
    } catch {
      try {
        process.kill(pid, "SIGKILL");
        killed++;
      } catch {}
    }
  }

  // Clear the file — we've handled everything
  try {
    writeFileSync(PID_FILE, "[]", "utf-8");
  } catch {}

  return killed;
}

/** Check if a PID belongs to an LSP-related process (not a reused PID for something else) */
function isLspProcess(pid: number): boolean {
  try {
    // ps -o command= gives just the command with no header
    const cmd = execSync(`ps -o command= -p ${String(pid)}`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1000,
    }).trim();
    // Match known LSP server patterns
    return /language.server|lsp|tsserver|pyright|gopls|rust-analyzer|clangd|biome|taplo|solargraph|intelephense|lua-language-server|zls|jdtls|metals|sourcekit-lsp|dart.*language-server|elixir-ls|ocamllsp|yaml-language-server|bash-language-server|emmet|css-language-server|html-language-server|json-language-server|eslint.*language-server|deno.*lsp|vue-language-server/i.test(
      cmd,
    );
  } catch {
    // Can't determine — don't kill to be safe
    return false;
  }
}

/**
 * Synchronous kill of all LSP PIDs tracked this session.
 * Called during process exit when async operations won't complete.
 * Sends SIGKILL directly — no grace period, no awaiting.
 */
export function killAllLspSync(): void {
  for (const pid of activePids) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  }
  activePids.clear();
  // Clear the PID file so next startup doesn't re-kill
  try {
    writeFileSync(PID_FILE, "[]", "utf-8");
  } catch {}
}
