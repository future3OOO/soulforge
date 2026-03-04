import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";
import { stepCountIs, ToolLoopAgent } from "ai";
import { buildReadOnlyTools } from "../tools/index.js";
import type { AgentBus } from "./agent-bus.js";
import { buildBusTools } from "./bus-tools.js";

const EXPLORE_INSTRUCTIONS = `You are an explore agent within SoulForge — a terminal IDE.
Your job is to thoroughly research a codebase question using read-only tools.
You can read files, search with grep, and find files with glob.
You CANNOT edit files or run shell commands.

Research thoroughly, then produce a clear summary of your findings.
Include relevant file paths, line numbers, and code snippets in your summary.`;

const EXPLORE_BUS_INSTRUCTIONS = `You are an explore agent within SoulForge — a terminal IDE.
Your job is to thoroughly research a codebase question using read-only tools.
You can read files, search with grep, and find files with glob.
You CANNOT edit files or run shell commands.

You are running IN PARALLEL with other agents. You have access to a shared coordination bus:
- Use \`report_finding\` to share important discoveries with peer agents as you find them.
  Don't wait until the end — share findings early and often so peers can use them.
- Use \`check_findings\` to see what peer agents have discovered so far.
- Use \`check_agent_result\` to check if a specific peer has completed.

Research thoroughly, then produce a clear summary of your findings.
Include relevant file paths, line numbers, and code snippets in your summary.`;

interface ExploreAgentOptions {
  bus?: AgentBus;
  agentId?: string;
  providerOptions?: ProviderOptions;
  headers?: Record<string, string>;
}

export function createExploreAgent(model: LanguageModel, options?: ExploreAgentOptions) {
  const busTools =
    options?.bus && options?.agentId ? buildBusTools(options.bus, options.agentId) : {};

  const hasBus = Object.keys(busTools).length > 0;

  return new ToolLoopAgent({
    id: options?.agentId ?? "explore",
    model,
    tools: {
      ...buildReadOnlyTools(),
      ...busTools,
    },
    instructions: hasBus ? EXPLORE_BUS_INSTRUCTIONS : EXPLORE_INSTRUCTIONS,
    stopWhen: stepCountIs(150),
    ...(options?.providerOptions && Object.keys(options.providerOptions).length > 0
      ? { providerOptions: options.providerOptions }
      : {}),
    ...(options?.headers ? { headers: options.headers } : {}),
  });
}
