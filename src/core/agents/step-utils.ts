import type { ModelMessage, ProviderOptions } from "@ai-sdk/provider-utils";
import { type PrepareStepFunction, pruneMessages, type StopCondition } from "ai";
import type { AgentBus } from "./agent-bus.js";

const ANTHROPIC_CACHE: ProviderOptions = {
  anthropic: { cacheControl: { type: "ephemeral" } },
};

interface PrepareStepOptions {
  bus?: AgentBus;
  agentId?: string;
  role: "explore" | "code";
  allTools: Record<string, unknown>;
}

const READ_TOOLS = new Set([
  "read_file",
  "read_code",
  "grep",
  "glob",
  "navigate",
  "analyze",
  "web_search",
  "fetch_page",
  "check_findings",
  "check_peers",
  "check_agent_result",
  "done",
]);

const CONTEXT_TRIM_THRESHOLD_EXPLORE = 50_000;
const CONTEXT_TRIM_THRESHOLD_CODE = 80_000;
const BUDGET_WARNING_THRESHOLD_EXPLORE = 60_000;
const BUDGET_WARNING_THRESHOLD_CODE = 120_000;
const FORCE_DONE_THRESHOLD_EXPLORE = 70_000;
const FORCE_DONE_THRESHOLD_CODE = 135_000;

export function buildPrepareStep({
  bus,
  agentId,
  role,
  allTools,
  // biome-ignore lint/suspicious/noExplicitAny: TOOLS generic is invariant — tool-agnostic functions use <any> (same as SDK's stepCountIs/hasToolCall)
}: PrepareStepOptions): PrepareStepFunction<any> {
  const allToolNames = Object.keys(allTools);
  const readOnlyNames = allToolNames.filter((n) => READ_TOOLS.has(n));
  const trimThreshold =
    role === "explore" ? CONTEXT_TRIM_THRESHOLD_EXPLORE : CONTEXT_TRIM_THRESHOLD_CODE;

  return ({ stepNumber, steps, messages }) => {
    const result: {
      toolChoice?: "required" | "auto";
      activeTools?: string[];
      system?: string;
      messages?: ModelMessage[];
    } = {};

    // Sanitize non-dict tool-call inputs to prevent Anthropic API rejections
    for (const msg of messages) {
      if (msg.role !== "assistant" || typeof msg.content === "string") continue;
      if (!Array.isArray(msg.content)) continue;
      for (let i = 0; i < msg.content.length; i++) {
        const part = msg.content[i] as (typeof msg.content)[number];
        if (part.type !== "tool-call") continue;
        const input = (part as { input: unknown }).input;
        if (typeof input === "object" && input !== null && !Array.isArray(input)) continue;
        (msg.content as unknown[])[i] = { ...part, input: {} };
      }
    }

    if (stepNumber === 0) {
      result.toolChoice = "required";
    }

    if (stepNumber > 0 && messages.length >= 2) {
      for (const msg of messages) {
        if (msg.providerOptions?.anthropic) {
          const { anthropic: _, ...rest } = msg.providerOptions;
          msg.providerOptions = Object.keys(rest).length > 0 ? rest : undefined;
        }
      }
      const target = messages[messages.length - 2];
      if (target) {
        target.providerOptions = { ...target.providerOptions, ...ANTHROPIC_CACHE };
      }
    }

    const totalTokens = steps.reduce((sum, s) => {
      return sum + (s.usage.inputTokens ?? 0) + (s.usage.outputTokens ?? 0);
    }, 0);

    if (totalTokens > trimThreshold) {
      result.messages = pruneMessages({
        messages,
        reasoning: "before-last-message",
        toolCalls: [
          {
            type: "before-last-4-messages",
            tools: ["read_file", "read_code", "grep", "glob", "shell"],
          },
        ],
      });

      if (bus && agentId) {
        result.system = buildBusSummary(bus, agentId, role);
      }
    }

    const forceThreshold =
      role === "explore" ? FORCE_DONE_THRESHOLD_EXPLORE : FORCE_DONE_THRESHOLD_CODE;
    const warnThreshold =
      role === "explore" ? BUDGET_WARNING_THRESHOLD_EXPLORE : BUDGET_WARNING_THRESHOLD_CODE;

    if (totalTokens > forceThreshold) {
      result.activeTools = ["done"];
      result.toolChoice = "required";
      const existing = result.system ?? "";
      result.system =
        `${existing}\nToken budget exhausted. You MUST call done NOW with everything you have. Include all code excerpts and findings gathered so far.`.trim();
    } else if (role === "explore" && totalTokens > warnThreshold) {
      result.activeTools = [...readOnlyNames];
      const existing = result.system ?? "";
      result.system =
        `${existing}\nYou are running low on token budget. Wrap up your research and call done with your findings.`.trim();
    } else if (role === "code" && totalTokens > warnThreshold) {
      const existing = result.system ?? "";
      result.system =
        `${existing}\nYou are running low on token budget. Finish your current edit, verify, and call done.`.trim();
    }

    if (bus && agentId) {
      const unseen = bus.drainUnseenFindings(agentId);
      if (unseen) {
        const existing = result.system ?? "";
        result.system = `${existing}\n\n--- Peer findings (new) ---\n${unseen}`.trim();
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  };
}

function buildBusSummary(bus: AgentBus, agentId: string, role: string): string {
  const parts: string[] = [
    "--- Context recovery (old tool results were pruned to save tokens) ---",
  ];

  const myReads = bus.getFilesRead(agentId).get(agentId);
  if (myReads && myReads.length > 0) {
    parts.push(`Files you already read: ${myReads.join(", ")}`);
  }

  if (role === "code") {
    const myEdits = bus.getEditedFiles(agentId);
    if (myEdits.size > 0) {
      parts.push(`Files you edited: ${[...myEdits.keys()].join(", ")}`);
    }
  }

  const peerReads = bus.getFilesRead();
  const peerFiles: string[] = [];
  for (const [peerId, files] of peerReads) {
    if (peerId !== agentId && files.length > 0) {
      peerFiles.push(`${peerId}: ${files.join(", ")}`);
    }
  }
  if (peerFiles.length > 0) {
    parts.push(`Peers' files (cached — your reads will be instant): ${peerFiles.join("; ")}`);
  }

  const toolSummaries = bus.getToolResultSummary();
  if (toolSummaries.length > 0) {
    const display = toolSummaries.slice(0, 20);
    parts.push(`Cached tool results (re-calls will be instant): ${display.join("; ")}`);
  }

  return parts.length > 1 ? parts.join("\n") : "";
}

// biome-ignore lint/suspicious/noExplicitAny: TOOLS generic is invariant — tool-agnostic functions use <any> (same as SDK's stepCountIs/hasToolCall)
export function tokenBudget(maxTokens: number): StopCondition<any> {
  return ({ steps }) => {
    const total = steps.reduce((sum, s) => {
      return sum + (s.usage.inputTokens ?? 0) + (s.usage.outputTokens ?? 0);
    }, 0);
    return total >= maxTokens;
  };
}
