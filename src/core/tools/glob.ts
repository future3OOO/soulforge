import { spawn } from "node:child_process";
import type { ToolResult } from "../../types";

interface GlobArgs {
  pattern: string;
  path?: string;
}

export const globTool = {
  name: "glob",
  description: "Find files matching a glob pattern.",
  execute: async (args: GlobArgs): Promise<ToolResult> => {
    const pattern = args.pattern;
    const basePath = args.path ?? ".";

    return new Promise((resolve) => {
      const proc = spawn("fd", ["--glob", pattern, basePath, "--max-results", "50"], {
        cwd: process.cwd(),
        timeout: 10_000,
      });

      const chunks: string[] = [];
      proc.stdout.on("data", (data: Buffer) => chunks.push(data.toString()));

      proc.on("close", (code: number | null) => {
        if (code === 0) {
          resolve({ success: true, output: chunks.join("") || "No files found." });
        } else {
          // Fallback to find
          const findProc = spawn("find", [basePath, "-name", pattern, "-maxdepth", "5"], {
            cwd: process.cwd(),
            timeout: 10_000,
          });

          const findChunks: string[] = [];
          findProc.stdout.on("data", (data: Buffer) => findChunks.push(data.toString()));
          findProc.on("close", () => {
            resolve({
              success: true,
              output: findChunks.join("") || "No files found.",
            });
          });
        }
      });
    });
  },
};
