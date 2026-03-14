import { existsSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { ToolResult } from "../../types";
import { readBufferContent } from "../editor/instance";
import { isForbidden } from "../security/forbidden.js";
import { emitFileRead } from "./file-events.js";

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".cc",
  ".hpp",
  ".cs",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".scala",
  ".lua",
  ".ex",
  ".exs",
  ".dart",
  ".zig",
]);

interface ReadFileArgs {
  path: string;
  startLine?: number;
  endLine?: number;
}

export const readFileTool = {
  name: "read_file",
  description: "Read file contents with line numbers.",
  execute: async (args: ReadFileArgs): Promise<ToolResult> => {
    try {
      const filePath = resolve(args.path);

      const blocked = isForbidden(filePath);
      if (blocked) {
        const msg = `Access denied: "${args.path}" matches forbidden pattern "${blocked}". This file is blocked for security.`;
        return { success: false, output: msg, error: msg };
      }

      if (!existsSync(filePath)) {
        return {
          success: false,
          output: `File not found: ${filePath}`,
          error: `File not found: ${filePath}`,
        };
      }

      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        return {
          success: false,
          output: `Path is a directory: ${filePath}`,
          error: `Path is a directory: ${filePath}`,
        };
      }

      const MAX_READ_LINES = 500;
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

      if (stat.size > MAX_FILE_SIZE && args.startLine == null && args.endLine == null) {
        const sizeStr = `${String(Math.round(stat.size / (1024 * 1024)))}MB`;
        const preview = Bun.file(filePath).stream();
        const decoder = new TextDecoder();
        const previewLines: string[] = [];
        let leftover = "";
        for await (const chunk of preview) {
          leftover += decoder.decode(chunk, { stream: true });
          const parts = leftover.split("\n");
          leftover = parts.pop() ?? "";
          for (const line of parts) {
            previewLines.push(line);
            if (previewLines.length >= MAX_READ_LINES) break;
          }
          if (previewLines.length >= MAX_READ_LINES) break;
        }
        const numbered = previewLines
          .map((line: string, i: number) => `${String(i + 1).padStart(4)}  ${line}`)
          .join("\n");

        emitFileRead(filePath);
        return {
          success: true,
          output: `${numbered}\n\n[Truncated — file is ${sizeStr}, showing first ${String(previewLines.length)} lines. Use startLine/endLine to read specific sections.]`,
        };
      }

      const content = await readBufferContent(filePath);
      const lines = content.split("\n");

      const start = (args.startLine ?? 1) - 1;
      const end = args.endLine ?? lines.length;
      const slice = lines.slice(start, end);

      const isFullRead = args.startLine == null && args.endLine == null;
      const wasCapped = isFullRead && slice.length > MAX_READ_LINES;
      const displaySlice = wasCapped ? slice.slice(0, MAX_READ_LINES) : slice;

      const numbered = displaySlice
        .map((line: string, i: number) => `${String(start + i + 1).padStart(4)}  ${line}`)
        .join("\n");

      emitFileRead(filePath);

      const capNotice = wasCapped
        ? `\n\n[File has ${String(lines.length)} lines — showing first ${String(MAX_READ_LINES)}. Use startLine/endLine to read specific sections.]`
        : "";

      if (isFullRead && lines.length > 100 && CODE_EXTENSIONS.has(extname(filePath))) {
        const outline = await getCompactOutline(filePath);
        if (outline) return { success: true, output: `${outline}\n${numbered}${capNotice}` };
      }

      return { success: true, output: `${numbered}${capNotice}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: msg, error: msg };
    }
  },
};

async function getCompactOutline(filePath: string): Promise<string | null> {
  try {
    const { getIntelligenceRouter } = await import("../intelligence/index.js");
    const router = getIntelligenceRouter(process.cwd());
    const language = router.detectLanguage(filePath);
    const outline = await router.executeWithFallback(language, "getFileOutline", (b) =>
      b.getFileOutline ? b.getFileOutline(filePath) : Promise.resolve(null),
    );
    if (!outline || outline.symbols.length === 0) return null;

    const symbolLines = outline.symbols.map((s) => {
      const end = s.location.endLine ? `-${String(s.location.endLine)}` : "";
      return `  ${s.kind} ${s.name} — ${String(s.location.line)}${end}`;
    });

    return `[Outline: ${String(outline.symbols.length)} symbols — use read_code for targeted reading]\n${symbolLines.join("\n")}\n`;
  } catch {
    return null;
  }
}
