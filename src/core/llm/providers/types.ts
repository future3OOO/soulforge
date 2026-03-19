import type { LanguageModel } from "ai";

export interface ProviderModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  envVar: string;
  icon: string;
  createModel(modelId: string): LanguageModel;
  fetchModels(): Promise<ProviderModelInfo[] | null>;
  fallbackModels: ProviderModelInfo[];
  contextWindows: [pattern: string, tokens: number][];
  grouped?: boolean;
  custom?: boolean;
  checkAvailability?(): Promise<boolean>;
  onActivate?(): Promise<void>;
  onDeactivate?(): void;
}

export interface CustomProviderConfig {
  id: string;
  name?: string;
  baseURL: string;
  envVar?: string;
  models?: (string | ProviderModelInfo)[];
  modelsAPI?: string;
}
