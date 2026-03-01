import { spawn } from "node:child_process";

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  isDirty: boolean;
  staged: string[];
  modified: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

export interface GitLogEntry {
  hash: string;
  subject: string;
  date: string;
}

function run(args: string[], cwd: string): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    const proc = spawn("git", args, { cwd, timeout: 5_000, env: { ...process.env } });
    proc.stdout.on("data", (d: Buffer) => chunks.push(d.toString()));
    proc.on("close", (code) => resolve({ ok: code === 0, stdout: chunks.join("") }));
    proc.on("error", () => resolve({ ok: false, stdout: "" }));
  });
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const { ok } = await run(["rev-parse", "--is-inside-work-tree"], cwd);
  return ok;
}

export async function getGitBranch(cwd: string): Promise<string | null> {
  const { ok, stdout } = await run(["branch", "--show-current"], cwd);
  return ok ? stdout.trim() || null : null;
}

export async function getGitStatus(cwd: string): Promise<GitStatus> {
  const repoCheck = await isGitRepo(cwd);
  if (!repoCheck) {
    return {
      isRepo: false,
      branch: null,
      isDirty: false,
      staged: [],
      modified: [],
      untracked: [],
      ahead: 0,
      behind: 0,
    };
  }

  const [branchResult, statusResult, aheadBehindResult] = await Promise.all([
    getGitBranch(cwd),
    run(["status", "--porcelain=v1"], cwd),
    run(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], cwd),
  ]);

  const staged: string[] = [];
  const modified: string[] = [];
  const untracked: string[] = [];

  if (statusResult.ok) {
    for (const line of statusResult.stdout.split("\n")) {
      if (!line) continue;
      const x = line[0];
      const y = line[1];
      const file = line.slice(3);
      if (x === "?") {
        untracked.push(file);
      } else {
        if (x && x !== " " && x !== "?") staged.push(file);
        if (y && y !== " " && y !== "?") modified.push(file);
      }
    }
  }

  let ahead = 0;
  let behind = 0;
  if (aheadBehindResult.ok) {
    const parts = aheadBehindResult.stdout.trim().split(/\s+/);
    ahead = Number.parseInt(parts[0] ?? "0", 10) || 0;
    behind = Number.parseInt(parts[1] ?? "0", 10) || 0;
  }

  return {
    isRepo: true,
    branch: branchResult,
    isDirty: staged.length > 0 || modified.length > 0 || untracked.length > 0,
    staged,
    modified,
    untracked,
    ahead,
    behind,
  };
}

export async function getGitDiff(cwd: string, staged?: boolean): Promise<string> {
  const args = staged ? ["diff", "--cached"] : ["diff"];
  const { stdout } = await run(args, cwd);
  return stdout;
}

export async function getGitLog(cwd: string, count = 10): Promise<GitLogEntry[]> {
  const { ok, stdout } = await run(
    ["log", `--oneline`, `-n`, String(count), "--format=%h %s (%cr)"],
    cwd,
  );
  if (!ok) return [];
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const spaceIdx = line.indexOf(" ");
      const hash = line.slice(0, spaceIdx);
      const rest = line.slice(spaceIdx + 1);
      const parenIdx = rest.lastIndexOf("(");
      const subject = parenIdx > 0 ? rest.slice(0, parenIdx).trim() : rest;
      const date = parenIdx > 0 ? rest.slice(parenIdx + 1, -1) : "";
      return { hash, subject, date };
    });
}

export async function gitInit(cwd: string): Promise<boolean> {
  const { ok } = await run(["init"], cwd);
  return ok;
}

export async function gitCommit(
  cwd: string,
  message: string,
): Promise<{ ok: boolean; output: string }> {
  const { ok, stdout } = await run(["commit", "-m", message], cwd);
  return { ok, output: stdout };
}

export async function gitAdd(cwd: string, files: string[]): Promise<boolean> {
  const { ok } = await run(["add", ...files], cwd);
  return ok;
}

export async function buildGitContext(cwd: string): Promise<string | null> {
  const status = await getGitStatus(cwd);
  if (!status.isRepo) return null;

  const lines: string[] = [];
  lines.push(`Branch: ${status.branch ?? "(detached)"}`);
  if (status.isDirty) {
    const parts: string[] = [];
    if (status.staged.length > 0) parts.push(`${String(status.staged.length)} staged`);
    if (status.modified.length > 0) parts.push(`${String(status.modified.length)} modified`);
    if (status.untracked.length > 0) parts.push(`${String(status.untracked.length)} untracked`);
    lines.push(`Status: dirty (${parts.join(", ")})`);
  } else {
    lines.push("Status: clean");
  }
  if (status.ahead > 0) lines.push(`Ahead: ${String(status.ahead)} commit(s)`);
  if (status.behind > 0) lines.push(`Behind: ${String(status.behind)} commit(s)`);

  const log = await getGitLog(cwd, 5);
  if (log.length > 0) {
    lines.push("", "Recent commits:");
    for (const entry of log) {
      lines.push(`  ${entry.hash} ${entry.subject} (${entry.date})`);
    }
  }

  return lines.join("\n");
}
