import type { LanguageModel } from "ai";
import { tool } from "ai";
import { z } from "zod";
import { createCodeAgent } from "./code.js";
import { createExploreAgent } from "./explore.js";

/**
 * Wraps explore/code subagents as tool definitions for the main Forge agent.
 * Each call creates a fresh agent instance (fresh context window).
 */
export function buildSubagentTools(model: LanguageModel) {
  return {
    explore: tool({
      description:
        "Delegate a research/exploration task to a subagent. " +
        "The explore agent can read files, grep, and glob but cannot edit or run commands. " +
        "Use this for understanding code, finding patterns, or investigating issues.",
      inputSchema: z.object({
        task: z.string().describe("A detailed description of what to research or explore"),
      }),
      execute: async (args, { abortSignal }) => {
        const agent = createExploreAgent(model);
        const result = await agent.generate({
          prompt: args.task,
          abortSignal,
        });
        return result.text;
      },
    }),

    code: tool({
      description:
        "Delegate a coding task to a subagent. " +
        "The code agent can read, edit, run shell commands, grep, and glob. " +
        "Use this for implementing changes, refactoring, or fixing bugs.",
      inputSchema: z.object({
        task: z.string().describe("A detailed description of the code changes to implement"),
      }),
      execute: async (args, { abortSignal }) => {
        const agent = createCodeAgent(model);
        const result = await agent.generate({
          prompt: args.task,
          abortSignal,
        });
        return result.text;
      },
    }),
  };
}
