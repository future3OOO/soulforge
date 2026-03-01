import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";
import { gateway } from "ai";

export interface ProviderStatus {
  id: string;
  name: string;
  available: boolean;
  envVar: string;
}

export const PROVIDERS: Record<string, { name: string; envVar: string }> = {
  anthropic: { name: "Claude", envVar: "ANTHROPIC_API_KEY" },
  openai: { name: "OpenAI", envVar: "OPENAI_API_KEY" },
  xai: { name: "Grok", envVar: "XAI_API_KEY" },
  google: { name: "Gemini", envVar: "GOOGLE_GENERATIVE_AI_API_KEY" },
  ollama: { name: "Ollama", envVar: "" },
};

/**
 * Check which providers have API keys configured.
 */
export function checkProviders(): ProviderStatus[] {
  const hasGateway = Boolean(process.env.AI_GATEWAY_API_KEY);

  return Object.entries(PROVIDERS).map(([id, { name, envVar }]) => ({
    id,
    name,
    envVar,
    available: id === "ollama" ? true : hasGateway || Boolean(process.env[envVar]),
  }));
}

/**
 * Returns true if the gateway is configured.
 */
export function hasGateway(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

/**
 * Resolve a model ID (e.g. "anthropic/claude-sonnet-4") to a LanguageModel.
 * Uses AI SDK Gateway if AI_GATEWAY_API_KEY is set, otherwise falls back
 * to direct provider SDKs.
 */
export function resolveModel(modelId: string): LanguageModel {
  // Gateway mode — universal access with a single key
  if (process.env.AI_GATEWAY_API_KEY) {
    return gateway(modelId);
  }

  // Direct provider fallback
  const slashIdx = modelId.indexOf("/");
  if (slashIdx === -1) {
    throw new Error(`Invalid model ID "${modelId}" — expected "provider/model" format`);
  }

  const provider = modelId.slice(0, slashIdx);
  const model = modelId.slice(slashIdx + 1);

  switch (provider) {
    case "anthropic": {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not set");
      }
      return createAnthropic()(model);
    }
    case "openai": {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set");
      }
      return createOpenAI()(model);
    }
    case "xai": {
      if (!process.env.XAI_API_KEY) {
        throw new Error("XAI_API_KEY is not set");
      }
      return createXai()(model);
    }
    case "google": {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
      }
      return createGoogleGenerativeAI()(model);
    }
    case "ollama": {
      const ollama = createOpenAI({
        baseURL: "http://localhost:11434/v1",
        apiKey: "ollama",
      });
      return ollama(model);
    }
    default:
      // Last resort: try gateway anyway (might have OIDC or other auth)
      return gateway(modelId);
  }
}
