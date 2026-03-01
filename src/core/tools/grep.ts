import { spawn } from "node:child_process";
import type { ToolResult } from "../../types";

interface GrepArgs {
  pattern: string;
  path?: string;
  glob?: string;
}

export const grepTool = {
  name: "grep",
  description:
    "Search file contents using ripgrep. Returns matching lines with file paths and line numbers.",
  execute: async (args: GrepArgs): Promise<ToolResult> => {
    const pattern = args.pattern;
    const searchPath = args.path ?? ".";
    const glob = args.glob;

    const rgArgs = [
      "--line-number",
      "--color=never",
      "--max-count=50",
      ...(glob ? ["--glob", glob] : []),
      pattern,
      searchPath,
    ];

    return new Promise((resolve) => {
      const proc = spawn("rg", rgArgs, {
        cwd: process.cwd(),
        timeout: 10_000,
      });

      const chunks: string[] = [];
      proc.stdout.on("data", (data: Buffer) => chunks.push(data.toString()));

      proc.on("close", (code: number | null) => {
        const output = chunks.join("");
        if (code === 0 || code === 1) {
          resolve({
            success: true,
            output: output || "No matches found.",
          });
        } else {
          // Fallback to grep
          const fallbackArgs = ["-rn", pattern, searchPath];
          if (glob) fallbackArgs.push("--include", glob);

          const grepProc = spawn("grep", fallbackArgs, {
            cwd: process.cwd(),
            timeout: 10_000,
          });

          const grepChunks: string[] = [];
          grepProc.stdout.on("data", (data: Buffer) => grepChunks.push(data.toString()));
          grepProc.on("close", () => {
            resolve({
              success: true,
              output: grepChunks.join("") || "No matches found.",
            });
          });
        }
      });
    });
  },
};
