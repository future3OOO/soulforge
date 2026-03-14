import { homedir } from "node:os";
import { relative, resolve } from "node:path";

export type OutsideKind = "config" | "tmp" | "outside";

const HOME = homedir();
const CONFIG_DIR = `${HOME}/.soulforge`;

const WHITELISTED_PREFIXES = [CONFIG_DIR, "/tmp", "/private/tmp"];

export function classifyPath(resolvedPath: string, cwd: string): OutsideKind | null {
  const rel = relative(cwd, resolvedPath);
  if (!rel.startsWith("..") && !rel.startsWith("/")) return null;

  for (const prefix of WHITELISTED_PREFIXES) {
    if (resolvedPath.startsWith(prefix)) {
      return resolvedPath.startsWith(CONFIG_DIR) ? "config" : "tmp";
    }
  }

  return "outside";
}

const WRITE_TOOLS = new Set([
  "edit_file",
  "multi_edit",
  "write_file",
  "create_file",
  "rename_symbol",
  "move_symbol",
  "refactor",
]);

export function needsOutsideConfirm(toolName: string, resolvedPath: string, cwd: string): boolean {
  const kind = classifyPath(resolvedPath, cwd);
  if (!kind || kind === "config" || kind === "tmp") return false;
  return WRITE_TOOLS.has(toolName) || toolName === "shell";
}

export function extractToolPath(toolName: string, args: Record<string, unknown>): string | null {
  if ("path" in args && typeof args.path === "string") return resolve(args.path);
  if ("file" in args && typeof args.file === "string") return resolve(args.file);
  if ("from" in args && typeof args.from === "string") return resolve(args.from);
  if ("to" in args && typeof args.to === "string") return resolve(args.to);

  if (toolName === "shell" && typeof args.cwd === "string") {
    return resolve(args.cwd);
  }

  return null;
}
