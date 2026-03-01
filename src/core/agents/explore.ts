import type { LanguageModel } from "ai";
import { stepCountIs, ToolLoopAgent } from "ai";
import { buildReadOnlyTools } from "../tools/index.js";

const EXPLORE_INSTRUCTIONS = `You are an explore agent within SoulForge — a terminal IDE.
Your job is to thoroughly research a codebase question using read-only tools.
You can read files, search with grep, and find files with glob.
You CANNOT edit files or run shell commands.

Research thoroughly, then produce a clear summary of your findings.
Include relevant file paths, line numbers, and code snippets in your summary.`;

export function createExploreAgent(model: LanguageModel) {
  return new ToolLoopAgent({
    id: "explore",
    model,
    tools: buildReadOnlyTools(),
    instructions: EXPLORE_INSTRUCTIONS,
    stopWhen: stepCountIs(15),
  });
}
