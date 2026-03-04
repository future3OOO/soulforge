import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { AppConfig, ContextManagementConfig } from "../../types/index.js";
import { getModelContextWindow } from "./models.js";
import type { TaskType } from "./task-router.js";

// ─── Provider Detection ───

/**
 * Returns true if the model ID uses a provider that speaks native Anthropic API
 * (i.e. @ai-sdk/anthropic). Currently: "anthropic" and "proxy" providers.
 */
export function isAnthropicNative(modelId: string): boolean {
  const slash = modelId.indexOf("/");
  if (slash === -1) return false;
  const provider = modelId.slice(0, slash);
  return provider === "anthropic" || provider === "proxy";
}

/**
 * Returns true if the model portion of the ID is a Claude model.
 * Also handles gateway "gateway/anthropic/claude-..." format.
 */
export function isClaudeModel(modelId: string): boolean {
  const slash = modelId.indexOf("/");
  const model = slash >= 0 ? modelId.slice(slash + 1) : modelId;
  return model.toLowerCase().startsWith("claude");
}

function supportsThinking(modelId: string): boolean {
  const slash = modelId.lastIndexOf("/");
  const model = (slash >= 0 ? modelId.slice(slash + 1) : modelId).toLowerCase();

  if (!model.startsWith("claude")) return false;

  const noThinking = [
    "claude-3-haiku",
    "claude-3-opus",
    "claude-3-sonnet",
    "claude-3.0",
    "claude-2",
    "claude-instant",
  ];
  for (const prefix of noThinking) {
    if (model.startsWith(prefix)) return false;
  }

  return true;
}

/**
 * Returns true if the model supports Anthropic-native providerOptions.
 * This includes direct Anthropic provider, proxy provider, and
 * gateway with Claude models.
 */
export function supportsAnthropicOptions(modelId: string): boolean {
  if (isAnthropicNative(modelId)) return true;
  // Gateway Claude models also go through @ai-sdk/anthropic under the hood
  const slash = modelId.indexOf("/");
  if (slash === -1) return false;
  const provider = modelId.slice(0, slash);
  return provider === "gateway" && isClaudeModel(modelId);
}

// ─── Effort by Task Type ───

const TASK_EFFORT: Record<TaskType, string> = {
  planning: "max",
  coding: "high",
  exploration: "medium",
  default: "high",
};

export function resolveEffort(taskType: TaskType, configured?: string): string {
  return configured ?? TASK_EFFORT[taskType];
}

// ─── Context Management Builder ───

function buildContextEdits(
  config: ContextManagementConfig,
  contextWindow: number,
  thinkingEnabled: boolean,
): unknown[] | null {
  const edits: unknown[] = [];

  if (config.clearThinking && thinkingEnabled) {
    edits.push({
      type: "clear_thinking_20251015",
      keep: { type: "thinking_turns", value: 5 },
    });
  }

  if (config.clearToolUses) {
    edits.push({
      type: "clear_tool_uses_20250919",
      trigger: { type: "input_tokens", value: 100_000 },
      keep: { type: "tool_uses", value: 10 },
      clearToolInputs: true,
    });
  }

  if (config.compact && contextWindow >= 200_000) {
    edits.push({
      type: "compact_20260112",
      trigger: { type: "input_tokens", value: Math.floor(contextWindow * 0.75) },
    });
  }

  return edits.length > 0 ? edits : null;
}

// ─── Main Builder ───

export interface ProviderOptionsResult {
  providerOptions: ProviderOptions;
  headers: Record<string, string> | undefined;
}

/**
 * Build providerOptions and headers for a Claude model.
 * Returns empty objects for non-Anthropic models (safe no-op).
 */
export function buildProviderOptions(
  modelId: string,
  config: AppConfig,
  taskType?: TaskType,
): ProviderOptionsResult {
  if (!supportsAnthropicOptions(modelId)) {
    return { providerOptions: {}, headers: undefined };
  }

  // Build the anthropic options object — typed as `any` internally
  // because the Anthropic SDK parses it with Zod at runtime.
  // biome-ignore lint/suspicious/noExplicitAny: ProviderOptions inner shape is parsed by Zod at runtime
  const anthropic: Record<string, any> = {};

  const thinkingMode = config.thinking?.mode ?? "auto";
  let thinkingEnabled = false;
  if (supportsThinking(modelId)) {
    if (thinkingMode === "auto" || thinkingMode === "adaptive") {
      anthropic.thinking = { type: "adaptive" };
      thinkingEnabled = true;
    } else if (thinkingMode === "enabled") {
      anthropic.thinking = {
        type: "enabled",
        ...(config.thinking?.budgetTokens ? { budgetTokens: config.thinking.budgetTokens } : {}),
      };
      thinkingEnabled = true;
    }
    // "disabled" → omit thinking
  }

  // Effort
  const effort = resolveEffort(taskType ?? "default", config.performance?.effort);
  anthropic.effort = effort;

  // Speed
  if (config.performance?.speed) {
    anthropic.speed = config.performance.speed;
  }

  // Context management
  if (config.contextManagement) {
    const contextWindow = getModelContextWindow(modelId);
    const edits = buildContextEdits(config.contextManagement, contextWindow, thinkingEnabled);
    if (edits) {
      anthropic.contextManagement = { edits };
    }
  }

  // Headers — interleaved thinking for tool-use agents
  const headers: Record<string, string> = {};
  if (thinkingEnabled) {
    headers["anthropic-beta"] = "interleaved-thinking-2025-05-14";
  }

  return {
    providerOptions: { anthropic } as ProviderOptions,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  };
}
