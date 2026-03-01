import { spawn } from "node:child_process";
import type { ToolResult } from "../../types";

const DEFAULT_TIMEOUT = 30_000;

interface ShellArgs {
  command: string;
  cwd?: string;
  timeout?: number;
}

export const shellTool = {
  name: "shell",
  description: "Execute a shell command and return its output.",
  execute: async (args: ShellArgs): Promise<ToolResult> => {
    const command = args.command;
    const cwd = args.cwd ?? process.cwd();
    const timeout = args.timeout ?? DEFAULT_TIMEOUT;

    return new Promise((resolve) => {
      const chunks: string[] = [];
      const errChunks: string[] = [];

      const proc = spawn("sh", ["-c", command], {
        cwd,
        timeout,
        env: { ...process.env },
      });

      proc.stdout.on("data", (data: Buffer) => chunks.push(data.toString()));
      proc.stderr.on("data", (data: Buffer) => errChunks.push(data.toString()));

      proc.on("close", (code: number | null) => {
        const stdout = chunks.join("");
        const stderr = errChunks.join("");

        if (code === 0) {
          resolve({ success: true, output: stdout || stderr });
        } else {
          resolve({
            success: false,
            output: stdout,
            error: stderr || `Exit code: ${code}`,
          });
        }
      });

      proc.on("error", (err: Error) => {
        resolve({ success: false, output: "", error: err.message });
      });
    });
  },
};
