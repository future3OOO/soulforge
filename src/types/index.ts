import type { ModelMessage } from "ai";

// ─── LLM Types ───

export interface RouterRule {
  /** glob pattern or keyword to match against the user message */
  match?: string;
  /** model ID in "provider/model" format */
  modelId: string;
  /** priority — higher wins when multiple rules match */
  priority?: number;
}

// ─── Tool Types ───

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

// ─── Chat / Session Types ───

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: ToolResult;
}

export interface Session {
  id: string;
  messages: ModelMessage[];
  cwd: string;
  startedAt: number;
}

// ─── Config Types ───

export interface AppConfig {
  defaultModel: string;
  routerRules: RouterRule[];
  editor: {
    command: string; // "nvim" by default
    args: string[];
  };
  theme: {
    accentColor: string;
  };
  nvimPath?: string;
}

// ─── Focus Types ───

export type FocusMode = "chat" | "editor";

// ─── Forge Mode Types ───

export type ForgeMode = "default" | "architect" | "socratic" | "challenge";

// ─── Editor Types ───

export type EditorMode = "chat" | "editor" | "split";

export interface EditorState {
  mode: EditorMode;
  currentFile: string | null;
  cursorLine: number;
  cursorCol: number;
  modified: boolean;
}
