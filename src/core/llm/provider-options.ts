import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { AppConfig, ContextManagementConfig } from "../../types/index.js";
import { getModelContextWindow } from "./models.js";
import type { TaskType } from "./task-router.js";

// ─── Capability System ───
//
// Two layers determine what features are sent to the API:
//   1. Model capabilities — what the model itself supports (Claude gen-based)
//   2. Provider constraints — what the provider/API layer passes through
//
// Effective capability = model supports it AND provider allows it.
// New providers just add an entry to PROVIDER_CONSTRAINTS.

interface ModelCapabilities {
  thinking: boolean;
  adaptiveThinking: boolean;
  effort: boolean;
  speed: boolean;
  contextManagement: boolean;
  interleavedThinking: boolean;
}

interface ProviderConstraints {
  anthropicOptions: boolean;
  effort: boolean;
  speed: boolean;
  contextManagement: boolean;
  adaptiveThinking: boolean;
  interleavedThinking: boolean;
}

const PROVIDER_CONSTRAINTS: Record<string, ProviderConstraints> = {
  anthropic: {
    anthropicOptions: true,
    effort: true,
    speed: true,
    contextManagement: true,
    adaptiveThinking: true,
    interleavedThinking: true,
  },
  proxy: {
    anthropicOptions: true,
    effort: false,
    speed: false,
    contextManagement: false,
    adaptiveThinking: false,
    interleavedThinking: false,
  },
  vercel_gateway: {
    anthropicOptions: true,
    effort: true,
    speed: true,
    contextManagement: true,
    adaptiveThinking: true,
    interleavedThinking: true,
  },
};

const NO_SUPPORT: ProviderConstraints = {
  anthropicOptions: false,
  effort: false,
  speed: false,
  contextManagement: false,
  adaptiveThinking: false,
  interleavedThinking: false,
};

// ─── Model + Provider Parsing ───

function parseModelId(modelId: string): { provider: string; model: string } {
  const slash = modelId.indexOf("/");
  if (slash === -1) return { provider: "", model: modelId };
  return { provider: modelId.slice(0, slash), model: modelId.slice(slash + 1) };
}

function extractBaseModel(modelId: string): string {
  const slash = modelId.lastIndexOf("/");
  return (slash >= 0 ? modelId.slice(slash + 1) : modelId).toLowerCase();
}

// ─── Claude Generation Detection ───

type ClaudeGen = "legacy" | "3.5" | "4+" | "non-claude";

const LEGACY_PREFIXES = [
  "claude-3-haiku",
  "claude-3-opus",
  "claude-3-sonnet",
  "claude-3.0",
  "claude-2",
  "claude-instant",
];

function getClaudeGen(model: string): ClaudeGen {
  if (!model.startsWith("claude")) return "non-claude";
  for (const p of LEGACY_PREFIXES) {
    if (model.startsWith(p)) return "legacy";
  }
  if (model.startsWith("claude-3.5") || model.startsWith("claude-3-5")) return "3.5";
  return "4+";
}

function getModelCapabilities(modelId: string): ModelCapabilities {
  const base = extractBaseModel(modelId);
  const gen = getClaudeGen(base);

  if (gen === "non-claude" || gen === "legacy") {
    return {
      thinking: false,
      adaptiveThinking: false,
      effort: false,
      speed: false,
      contextManagement: false,
      interleavedThinking: false,
    };
  }

  if (gen === "3.5") {
    return {
      thinking: true,
      adaptiveThinking: false,
      effort: false,
      speed: false,
      contextManagement: false,
      interleavedThinking: false,
    };
  }

  const hasSpeed = base.includes("opus");

  return {
    thinking: true,
    adaptiveThinking: true,
    effort: true,
    speed: hasSpeed,
    contextManagement: true,
    interleavedThinking: true,
  };
}

function getProviderConstraints(providerId: string): ProviderConstraints {
  if (!providerId) return NO_SUPPORT;

  const exact = PROVIDER_CONSTRAINTS[providerId];
  if (exact) return exact;

  // Vercel Gateway with Claude models gets Anthropic-level support
  if (providerId === "vercel_gateway") return PROVIDER_CONSTRAINTS.anthropic as ProviderConstraints;

  return NO_SUPPORT;
}

function getEffectiveCaps(modelId: string): ModelCapabilities & { anthropicOptions: boolean } {
  const model = getModelCapabilities(modelId);
  const { provider } = parseModelId(modelId);
  const pc = getProviderConstraints(provider);

  // Vercel Gateway only gets anthropic options if the underlying model is Claude
  const isGatewayNonClaude = provider === "vercel_gateway" && !isClaudeModel(modelId);

  return {
    anthropicOptions: pc.anthropicOptions && !isGatewayNonClaude,
    thinking: model.thinking,
    adaptiveThinking: model.adaptiveThinking && pc.adaptiveThinking,
    effort: model.effort && pc.effort,
    speed: model.speed && pc.speed,
    contextManagement: model.contextManagement && pc.contextManagement,
    interleavedThinking: model.interleavedThinking && pc.interleavedThinking,
  };
}

// ─── Public Detection Helpers ───

export function isAnthropicNative(modelId: string): boolean {
  const { provider } = parseModelId(modelId);
  return provider === "anthropic" || provider === "proxy";
}

export function isClaudeModel(modelId: string): boolean {
  return extractBaseModel(modelId).startsWith("claude");
}

export function supportsAnthropicOptions(modelId: string): boolean {
  return getEffectiveCaps(modelId).anthropicOptions;
}

// ─── Effort by Task Type ───

const TASK_EFFORT: Record<TaskType, string> = {
  planning: "max",
  coding: "high",
  exploration: "medium",
  webSearch: "medium",
  compact: "medium",
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

export function buildProviderOptions(
  modelId: string,
  config: AppConfig,
  taskType?: TaskType,
): ProviderOptionsResult {
  const caps = getEffectiveCaps(modelId);

  if (!caps.anthropicOptions) {
    return { providerOptions: {}, headers: undefined };
  }

  // biome-ignore lint/suspicious/noExplicitAny: ProviderOptions inner shape is parsed by Zod at runtime
  const anthropic: Record<string, any> = {};
  let thinkingEnabled = false;

  if (caps.thinking) {
    const mode = config.thinking?.mode ?? "off";

    if (mode === "auto" || mode === "adaptive") {
      if (caps.adaptiveThinking) {
        anthropic.thinking = { type: "adaptive" };
        thinkingEnabled = true;
      }
      // When adaptive isn't available, skip — don't force a fixed budget
    } else if (mode === "enabled") {
      anthropic.thinking = {
        type: "enabled",
        ...(config.thinking?.budgetTokens ? { budgetTokens: config.thinking.budgetTokens } : {}),
      };
      thinkingEnabled = true;
    }
  }

  if (caps.effort && config.performance?.effort && config.performance.effort !== "off") {
    anthropic.effort = resolveEffort(taskType ?? "default", config.performance.effort);
  }

  if (caps.speed && config.performance?.speed && config.performance.speed !== "off") {
    anthropic.speed = config.performance.speed;
  }

  if (caps.contextManagement && config.contextManagement) {
    const contextWindow = getModelContextWindow(modelId);
    const edits = buildContextEdits(config.contextManagement, contextWindow, thinkingEnabled);
    if (edits) {
      anthropic.contextManagement = { edits };
    }
  }

  const headers: Record<string, string> = {};
  if (thinkingEnabled && caps.interleavedThinking) {
    headers["anthropic-beta"] = "interleaved-thinking-2025-05-14";
  }

  return {
    providerOptions: { anthropic } as ProviderOptions,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  };
}

// ─── Degradation for Retry ───

export function degradeProviderOptions(modelId: string, level: number): ProviderOptionsResult {
  if (level >= 2 || !supportsAnthropicOptions(modelId)) {
    return { providerOptions: {}, headers: undefined };
  }

  const caps = getModelCapabilities(modelId);
  // biome-ignore lint/suspicious/noExplicitAny: ProviderOptions inner shape is parsed by Zod at runtime
  const anthropic: Record<string, any> = {};

  if (caps.thinking) {
    anthropic.thinking = { type: "enabled", budgetTokens: 5_000 };
  }

  return {
    providerOptions: { anthropic } as ProviderOptions,
    headers: undefined,
  };
}

export function isProviderOptionsError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return (
    lower.includes("not supported") ||
    lower.includes("not available") ||
    lower.includes("does not support") ||
    lower.includes("invalid parameter") ||
    lower.includes("inputschema") ||
    lower.includes("thinking is not supported") ||
    lower.includes("adaptive thinking") ||
    lower.includes("context management") ||
    lower.includes("unknown parameter")
  );
}

/**
 * Register custom provider constraints at runtime.
 * Call when adding a new provider to declare what the API layer supports.
 */
export function registerProviderConstraints(
  providerId: string,
  constraints: Partial<ProviderConstraints>,
): void {
  PROVIDER_CONSTRAINTS[providerId] = { ...NO_SUPPORT, ...constraints };
}
