import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";
import { stepCountIs, ToolLoopAgent } from "ai";
import type { EditorIntegration, InteractiveCallbacks } from "../../types/index.js";
import type { ContextManager } from "../context/manager.js";
import { buildInteractiveTools, buildTools } from "../tools/index.js";
import { buildSubagentTools } from "./subagent-tools.js";

interface ForgeAgentOptions {
  model: LanguageModel;
  contextManager: ContextManager;
  interactive?: InteractiveCallbacks;
  editorIntegration?: EditorIntegration;
  subagentModels?: { exploration?: LanguageModel; coding?: LanguageModel };
  onApproveWebSearch?: (query: string) => Promise<boolean>;
  providerOptions?: ProviderOptions;
  headers?: Record<string, string>;
  codeExecution?: boolean;
}

/**
 * Creates the main Forge ToolLoopAgent.
 * Factory function (not singleton) — model can change between turns (Ctrl+L).
 * Combines direct tools + subagent tools + optional interactive tools.
 */
export function createForgeAgent({
  model,
  contextManager,
  interactive,
  editorIntegration,
  subagentModels,
  onApproveWebSearch,
  providerOptions,
  headers,
  codeExecution,
}: ForgeAgentOptions) {
  return new ToolLoopAgent({
    id: "forge",
    model,
    tools: {
      ...buildTools(undefined, editorIntegration, onApproveWebSearch, { codeExecution }),
      ...buildSubagentTools({
        defaultModel: model,
        explorationModel: subagentModels?.exploration,
        codingModel: subagentModels?.coding,
        providerOptions,
        headers,
      }),
      ...(interactive ? buildInteractiveTools(interactive) : {}),
    },
    instructions: contextManager.buildSystemPrompt(),
    stopWhen: stepCountIs(500),
    ...(providerOptions && Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
    ...(headers ? { headers } : {}),
  });
}
