import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";
import { stepCountIs, ToolLoopAgent } from "ai";
import { buildCodeTools } from "../tools/index.js";
import type { AgentBus } from "./agent-bus.js";
import { buildBusTools } from "./bus-tools.js";

const CODE_INSTRUCTIONS = `You are a code agent within SoulForge — a terminal IDE.
Your job is to implement code changes as requested.
You have full access to read files, edit files, run shell commands, grep, and glob.

After making changes:
1. Verify your edits by reading the modified files
2. Run lint/typecheck if applicable (bun run lint, bun run typecheck)
3. Summarize what you changed and any issues found`;

const CODE_BUS_INSTRUCTIONS = `You are a code agent within SoulForge — a terminal IDE.
Your job is to implement code changes as requested.
You have full access to read files, edit files, run shell commands, grep, and glob.

You are running IN PARALLEL with other agents. You have access to a shared coordination bus:
- Use \`report_finding\` to share important discoveries with peer agents as you work.
  Share file paths you've modified, patterns you've found, or decisions you've made.
- Use \`check_findings\` to see what peer agents have discovered — use their findings
  to avoid duplicate work and make better decisions.
- Use \`check_agent_result\` to check if a dependency agent has completed and get its output.

After making changes:
1. Verify your edits by reading the modified files
2. Run lint/typecheck if applicable (bun run lint, bun run typecheck)
3. Summarize what you changed and any issues found`;

interface CodeAgentOptions {
  bus?: AgentBus;
  agentId?: string;
  providerOptions?: ProviderOptions;
  headers?: Record<string, string>;
}

export function createCodeAgent(model: LanguageModel, options?: CodeAgentOptions) {
  const busTools =
    options?.bus && options?.agentId ? buildBusTools(options.bus, options.agentId) : {};

  const hasBus = Object.keys(busTools).length > 0;

  return new ToolLoopAgent({
    id: options?.agentId ?? "code",
    model,
    tools: {
      ...buildCodeTools(),
      ...busTools,
    },
    instructions: hasBus ? CODE_BUS_INSTRUCTIONS : CODE_INSTRUCTIONS,
    stopWhen: stepCountIs(200),
    ...(options?.providerOptions && Object.keys(options.providerOptions).length > 0
      ? { providerOptions: options.providerOptions }
      : {}),
    ...(options?.headers ? { headers: options.headers } : {}),
  });
}
