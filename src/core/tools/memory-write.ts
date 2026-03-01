import type { ToolResult } from "../../types/index.js";
import { MemoryManager } from "../memory/manager.js";

interface MemoryWriteArgs {
  summary: string;
  rationale: string;
  tags?: string[];
}

export function createMemoryWriteTool(cwd: string) {
  const manager = new MemoryManager(cwd);

  return {
    name: "memory_write",
    description:
      "Record an architectural decision to the project's persistent memory. Use this when the user makes a significant design choice, establishes a pattern, or sets a project invariant.",
    execute: async (args: MemoryWriteArgs): Promise<ToolResult> => {
      try {
        const decision = manager.appendDecision({
          summary: args.summary,
          rationale: args.rationale,
          tags: args.tags,
        });
        return {
          success: true,
          output: `Decision recorded: ${decision.summary} (id: ${decision.id.slice(0, 8)})`,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, output: "", error: msg };
      }
    },
  };
}
