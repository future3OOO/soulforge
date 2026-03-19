import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface SkillSearchResult {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

export interface InstalledSkill {
  name: string;
  path: string;
  scope: "project" | "global";
}

interface SearchResponse {
  skills: SkillSearchResult[];
  count: number;
}

/** Search skills.sh for available skills */
export async function searchSkills(query: string): Promise<SkillSearchResult[]> {
  const url = `https://skills.sh/api/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Skills search failed: ${res.status}`);
  const data = (await res.json()) as SearchResponse;
  return data.skills;
}

/** Fetch popular/trending skills (broad query sorted by installs) */
export async function listPopularSkills(): Promise<SkillSearchResult[]> {
  return searchSkills("ai");
}

/** Detect whether bunx is available, falling back to npx */
async function detectRunner(): Promise<string> {
  try {
    const proc = Bun.spawn(["bunx", "--version"], { stdout: "pipe", stderr: "pipe" });
    const code = await proc.exited;
    if (code === 0) return "bunx";
  } catch {
    // bunx not found
  }
  return "npx";
}

/** Install a skill via bunx (or npx fallback) */
export async function installSkill(
  source: string,
  skillId: string,
  global = false,
): Promise<string> {
  const runner = await detectRunner();
  const args = [runner, "skills", "add", source, "--skill", skillId, "-y"];
  if (global) args.push("-g");
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(stderr.trim() || `Install failed with code ${String(exitCode)}`);
  }

  const stdout = await new Response(proc.stdout).text();
  return stdout.trim();
}

/** Scan known directories for installed SKILL.md files */
export function listInstalledSkills(): InstalledSkill[] {
  const byName = new Map<string, InstalledSkill>();
  const seenPaths = new Set<string>();

  // Scan global dirs first, then local — local overwrites global (preferred)
  const dirs: Array<{ path: string; scope: "global" | "project" }> = [
    { path: join(homedir(), ".soulforge", "skills"), scope: "global" },
    { path: join(homedir(), ".agents", "skills"), scope: "global" },
    { path: join(homedir(), ".claude", "skills"), scope: "global" },
    { path: join(process.cwd(), ".soulforge", "skills"), scope: "project" },
    { path: join(process.cwd(), ".agents", "skills"), scope: "project" },
    { path: join(process.cwd(), ".claude", "skills"), scope: "project" },
  ];

  for (const dir of dirs) {
    try {
      scanSkillDir(dir.path, dir.scope, byName, seenPaths);
    } catch {
      // Directory doesn't exist — skip
    }
  }

  return [...byName.values()];
}

function scanSkillDir(
  dir: string,
  scope: "global" | "project",
  byName: Map<string, InstalledSkill>,
  seenPaths: Set<string>,
): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);

    // Follow symlinks — check if the resolved path is a directory
    const isDir = entry.isDirectory() || (entry.isSymbolicLink() && isDirectorySafe(full));
    if (isDir) {
      try {
        const skillPath = join(full, "SKILL.md");
        const resolved = realpathSync(skillPath);
        if (seenPaths.has(resolved)) continue;
        readFileSync(skillPath, "utf-8"); // test existence
        seenPaths.add(resolved);
        // Overwrite by name — later scopes (project) take priority over earlier (global)
        byName.set(entry.name, { name: entry.name, path: skillPath, scope });
      } catch {
        // No SKILL.md in this subdirectory
      }
    } else if (entry.name === "SKILL.md") {
      const resolved = realpathSync(full);
      if (seenPaths.has(resolved)) continue;
      seenPaths.add(resolved);
      const parentName = dir.split("/").pop() ?? "skill";
      byName.set(parentName, { name: parentName, path: full, scope });
    }
  }
}

function isDirectorySafe(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Read a SKILL.md file and return its content */
export function loadSkill(path: string): string {
  return readFileSync(path, "utf-8");
}
