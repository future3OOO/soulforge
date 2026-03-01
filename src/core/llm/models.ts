import { PROVIDERS } from "./provider.js";

// ─── Types ───

export interface ProviderModelInfo {
  id: string;
  name: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  envVar: string;
}

// ─── Provider Configs (derived from PROVIDERS) ───

export const PROVIDER_CONFIGS: ProviderConfig[] = Object.entries(PROVIDERS).map(
  ([id, { name, envVar }]) => ({ id, name, envVar }),
);

// ─── Fallback Model Lists ───

const FALLBACK_MODELS: Record<string, ProviderModelInfo[]> = {
  anthropic: [
    { id: "claude-opus-4", name: "Claude Opus 4" },
    { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
    { id: "claude-haiku-4", name: "Claude Haiku 4" },
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "o3-mini", name: "o3 Mini" },
    { id: "o1", name: "o1" },
  ],
  xai: [
    { id: "grok-3", name: "Grok 3" },
    { id: "grok-3-mini", name: "Grok 3 Mini" },
  ],
  google: [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
  ],
  ollama: [
    { id: "llama3.1", name: "Llama 3.1" },
    { id: "codellama", name: "Code Llama" },
    { id: "mistral", name: "Mistral" },
    { id: "deepseek-coder-v2", name: "DeepSeek Coder v2" },
  ],
};

// ─── Cache ───

const modelCache = new Map<string, ProviderModelInfo[]>();

export function getCachedModels(providerId: string): ProviderModelInfo[] | null {
  return modelCache.get(providerId) ?? null;
}

// ─── OpenAI Allowlist Prefixes ───

const OPENAI_PREFIXES = ["gpt-4", "gpt-3.5", "o1", "o3", "chatgpt"];

// ─── Fetch Helpers ───

interface AnthropicModel {
  id: string;
  type: string;
  display_name?: string;
}

interface OpenAIModel {
  id: string;
}

interface GoogleModel {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

async function fetchAnthropic(apiKey: string): Promise<ProviderModelInfo[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const data = (await res.json()) as { data: AnthropicModel[] };
  const result: ProviderModelInfo[] = [];
  for (const m of data.data) {
    if (m.type === "model") result.push({ id: m.id, name: m.display_name ?? m.id });
  }
  return result;
}

async function fetchOpenAI(apiKey: string): Promise<ProviderModelInfo[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}`);
  const data = (await res.json()) as { data: OpenAIModel[] };
  const result: ProviderModelInfo[] = [];
  for (const m of data.data) {
    if (OPENAI_PREFIXES.some((p) => m.id.startsWith(p))) result.push({ id: m.id, name: m.id });
  }
  return result;
}

async function fetchXai(apiKey: string): Promise<ProviderModelInfo[]> {
  const res = await fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`xAI API ${res.status}`);
  const data = (await res.json()) as { data: OpenAIModel[] };
  const result: ProviderModelInfo[] = [];
  for (const m of data.data) {
    if (!m.id.includes("embed")) result.push({ id: m.id, name: m.id });
  }
  return result;
}

interface OllamaModel {
  name: string;
}

async function fetchOllama(): Promise<ProviderModelInfo[]> {
  const res = await fetch("http://localhost:11434/api/tags");
  if (!res.ok) throw new Error(`Ollama API ${res.status}`);
  const data = (await res.json()) as { models: OllamaModel[] };
  return data.models.map((m) => {
    const name = m.name.replace(/:latest$/, "");
    return { id: name, name };
  });
}

async function fetchGoogle(apiKey: string): Promise<ProviderModelInfo[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error(`Google API ${res.status}`);
  const data = (await res.json()) as { models: GoogleModel[] };
  const result: ProviderModelInfo[] = [];
  for (const m of data.models) {
    if (!m.supportedGenerationMethods?.includes("generateContent")) continue;
    const id = m.name?.replace("models/", "") ?? "";
    if (id === "") continue;
    result.push({ id, name: m.displayName ?? id });
  }
  return result;
}

// ─── Public API ───

export async function fetchProviderModels(providerId: string): Promise<ProviderModelInfo[]> {
  // Check cache first
  const cached = modelCache.get(providerId);
  if (cached) return cached;

  const providerInfo = PROVIDERS[providerId];
  if (!providerInfo) return getFallbackModels(providerId);

  // Ollama doesn't use an API key
  if (providerId === "ollama") {
    try {
      const models = await fetchOllama();
      modelCache.set(providerId, models);
      return models;
    } catch {
      return getFallbackModels(providerId);
    }
  }

  const apiKey = process.env[providerInfo.envVar];
  if (!apiKey) return getFallbackModels(providerId);

  try {
    let models: ProviderModelInfo[];

    switch (providerId) {
      case "anthropic":
        models = await fetchAnthropic(apiKey);
        break;
      case "openai":
        models = await fetchOpenAI(apiKey);
        break;
      case "xai":
        models = await fetchXai(apiKey);
        break;
      case "google":
        models = await fetchGoogle(apiKey);
        break;
      default:
        return getFallbackModels(providerId);
    }

    modelCache.set(providerId, models);
    return models;
  } catch {
    return getFallbackModels(providerId);
  }
}

function getFallbackModels(providerId: string): ProviderModelInfo[] {
  return FALLBACK_MODELS[providerId] ?? [];
}
