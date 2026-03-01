import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { ToolResult } from "../../types";

interface ReadFileArgs {
  path: string;
  startLine?: number;
  endLine?: number;
}

export const readFileTool = {
  name: "read_file",
  description: "Read the contents of a file. Returns the file content with line numbers.",
  execute: async (args: ReadFileArgs): Promise<ToolResult> => {
    try {
      const filePath = resolve(args.path);

      if (!existsSync(filePath)) {
        return { success: false, output: "", error: `File not found: ${filePath}` };
      }

      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        return { success: false, output: "", error: `Path is a directory: ${filePath}` };
      }

      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      const start = (args.startLine ?? 1) - 1;
      const end = args.endLine ?? lines.length;
      const slice = lines.slice(start, end);

      const numbered = slice
        .map((line: string, i: number) => `${String(start + i + 1).padStart(4)}  ${line}`)
        .join("\n");

      return { success: true, output: numbered };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: "", error: msg };
    }
  },
};
