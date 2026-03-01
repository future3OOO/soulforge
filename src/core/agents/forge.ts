import type { LanguageModel } from "ai";
import { stepCountIs, ToolLoopAgent } from "ai";
import type { ContextManager } from "../context/manager.js";
import { buildTools } from "../tools/index.js";
import { buildSubagentTools } from "./subagent-tools.js";

interface ForgeAgentOptions {
  model: LanguageModel;
  contextManager: ContextManager;
}

/**
 * Creates the main Forge ToolLoopAgent.
 * Factory function (not singleton) — model can change between turns (Ctrl+L).
 * Combines 5 direct tools + 2 subagent tools.
 */
export function createForgeAgent({ model, contextManager }: ForgeAgentOptions) {
  return new ToolLoopAgent({
    id: "forge",
    model,
    tools: {
      ...buildTools(),
      ...buildSubagentTools(model),
    },
    instructions: contextManager.buildSystemPrompt(),
    stopWhen: stepCountIs(10),
  });
}
