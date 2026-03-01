import type { LanguageModel } from "ai";
import { stepCountIs, ToolLoopAgent } from "ai";
import { buildCodeTools } from "../tools/index.js";

const CODE_INSTRUCTIONS = `You are a code agent within SoulForge — a terminal IDE.
Your job is to implement code changes as requested.
You have full access to read files, edit files, run shell commands, grep, and glob.

After making changes:
1. Verify your edits by reading the modified files
2. Run lint/typecheck if applicable (bun run lint, bun run typecheck)
3. Summarize what you changed and any issues found`;

export function createCodeAgent(model: LanguageModel) {
  return new ToolLoopAgent({
    id: "code",
    model,
    tools: buildCodeTools(),
    instructions: CODE_INSTRUCTIONS,
    stopWhen: stepCountIs(20),
  });
}
