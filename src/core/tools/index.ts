import { tool } from "ai";
import { z } from "zod";
import { editFileTool } from "./edit-file";
import { globTool } from "./glob";
import { grepTool } from "./grep";
import { createMemoryWriteTool } from "./memory-write";
import { readFileTool } from "./read-file";
import { shellTool } from "./shell";
import { webSearchTool } from "./web-search";

/**
 * Build Vercel AI SDK tool definitions.
 * AI SDK v6 uses `inputSchema` instead of `parameters`.
 */
export function buildTools(cwd?: string) {
  const memoryTool = createMemoryWriteTool(cwd ?? process.cwd());

  return {
    read_file: tool({
      description: readFileTool.description,
      inputSchema: z.object({
        path: z.string().describe("File path to read"),
        startLine: z.number().optional().describe("Start line (1-indexed)"),
        endLine: z.number().optional().describe("End line (1-indexed)"),
      }),
      execute: (args) => readFileTool.execute(args),
    }),

    edit_file: tool({
      description: editFileTool.description,
      inputSchema: z.object({
        path: z.string().describe("File path to edit"),
        oldString: z.string().describe("Exact string to replace (empty = create new file)"),
        newString: z.string().describe("Replacement string"),
      }),
      execute: (args) => editFileTool.execute(args),
    }),

    shell: tool({
      description: shellTool.description,
      inputSchema: z.object({
        command: z.string().describe("Shell command to execute"),
        cwd: z.string().optional().describe("Working directory"),
        timeout: z.number().optional().describe("Timeout in ms"),
      }),
      execute: (args) => shellTool.execute(args),
    }),

    grep: tool({
      description: grepTool.description,
      inputSchema: z.object({
        pattern: z.string().describe("Regex search pattern"),
        path: z.string().optional().describe("Directory to search"),
        glob: z.string().optional().describe("File glob filter"),
      }),
      execute: (args) => grepTool.execute(args),
    }),

    glob: tool({
      description: globTool.description,
      inputSchema: z.object({
        pattern: z.string().describe("Glob pattern"),
        path: z.string().optional().describe("Base directory"),
      }),
      execute: (args) => globTool.execute(args),
    }),

    web_search: tool({
      description: webSearchTool.description,
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        count: z.number().optional().describe("Number of results (default 5)"),
      }),
      execute: (args) => webSearchTool.execute(args),
    }),

    memory_write: tool({
      description: memoryTool.description,
      inputSchema: z.object({
        summary: z.string().describe("Brief summary of the architectural decision"),
        rationale: z.string().describe("Why this decision was made"),
        tags: z.array(z.string()).optional().describe("Tags for categorization"),
      }),
      execute: (args) => memoryTool.execute(args),
    }),
  };
}

/** Read-only tools for explore subagent */
export function buildReadOnlyTools() {
  const all = buildTools();
  return {
    read_file: all.read_file,
    grep: all.grep,
    glob: all.glob,
    web_search: all.web_search,
  };
}

/** Full code tools for code subagent */
export function buildCodeTools(cwd?: string) {
  return buildTools(cwd);
}

/** Get tool names for display */
export function getToolNames(): string[] {
  return [
    readFileTool.name,
    editFileTool.name,
    shellTool.name,
    grepTool.name,
    globTool.name,
    "web_search",
    "memory_write",
  ];
}
