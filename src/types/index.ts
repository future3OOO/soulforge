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

export interface TaskRouter {
  planning: string | null;
  coding: string | null;
  exploration: string | null;
  default: string | null;
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

// ─── Plan / Interactive Types ───

export type PlanStepStatus = "pending" | "active" | "done" | "skipped";

export interface PlanStep {
  id: string;
  label: string;
  status: PlanStepStatus;
  startedAt?: number;
}

export interface Plan {
  title: string;
  steps: PlanStep[];
  createdAt: number;
}

export interface PlanFileChange {
  path: string;
  action: "create" | "modify" | "delete";
  description: string;
}

export interface PlanOutput {
  title: string;
  context: string;
  files: PlanFileChange[];
  steps: Array<{ id: string; label: string }>;
  verification: string[];
}

export interface QuestionOption {
  label: string;
  value: string;
  description?: string;
}

export interface PendingQuestion {
  id: string;
  question: string;
  options: QuestionOption[];
  allowSkip: boolean;
  resolve: (answer: string) => void;
}

export interface InteractiveCallbacks {
  onPlanCreate: (plan: Plan) => void;
  onPlanStepUpdate: (stepId: string, status: PlanStepStatus) => void;
  onAskUser: (question: string, options: QuestionOption[], allowSkip: boolean) => Promise<string>;
  onOpenEditor: (file?: string) => Promise<void>;
  /** Called before every web_search execution. Resolves true = proceed, false = deny. */
  onWebSearchApproval: (query: string) => Promise<boolean>;
}

export interface QueuedMessage {
  content: string;
  queuedAt: number;
}

// ─── Chat / Session Types ───

export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "tools"; toolCallIds: string[] }
  | { type: "reasoning"; content: string; id: string }
  | { type: "plan"; plan: Plan };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  /** Ordered segments for interleaved text/tool rendering. */
  segments?: MessageSegment[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: ToolResult;
}

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  coreMessages: ModelMessage[];
  cwd: string;
  startedAt: number;
  updatedAt: number;
  /** Per-session config overrides (highest priority). */
  configOverrides?: Partial<AppConfig>;
}

// ─── Config Types ───

export type NvimConfigMode = "auto" | "default" | "user" | "none";

export interface CodeIntelligenceConfig {
  backend?: "auto" | "ts-morph" | "tree-sitter" | "regex";
  language?: string;
}

// ─── AI Provider Config Types ───

export type ThinkingMode = "adaptive" | "enabled" | "disabled" | "auto";

export interface ThinkingConfig {
  /** "auto" enables adaptive thinking for Anthropic models. Default: "auto" */
  mode: ThinkingMode;
  /** Budget tokens — only used when mode is "enabled". Min 1024. */
  budgetTokens?: number;
}

export type EffortLevel = "low" | "medium" | "high" | "max";

export interface PerformanceConfig {
  /** Effort level for model reasoning. Default: "high" */
  effort?: EffortLevel;
  /** Speed mode — "fast" enables 2.5x output for Opus 4.6 */
  speed?: "fast" | "standard";
}

export interface ContextManagementConfig {
  /** Enable server-side context compaction for 200K+ models */
  compact?: boolean;
  /** Clear old tool use results (keep last 10) */
  clearToolUses?: boolean;
  /** Clear old thinking blocks (keep last 5 turns) */
  clearThinking?: boolean;
}

export interface AppConfig {
  defaultModel: string;
  routerRules: RouterRule[];
  taskRouter?: TaskRouter;
  editor: {
    command: string; // "nvim" by default
    args: string[];
  };
  theme: {
    accentColor: string;
  };
  nvimPath?: string;
  nvimConfig?: NvimConfigMode;
  editorIntegration?: EditorIntegration;
  codeIntelligence?: CodeIntelligenceConfig;
  font?: string;
  thinking?: ThinkingConfig;
  performance?: PerformanceConfig;
  contextManagement?: ContextManagementConfig;
  codeExecution?: boolean;
  /** Enable web search tool for all LLMs. Always prompts for approval before searching. Default: true */
  webSearch?: boolean;
}

// ─── Focus Types ───

export type FocusMode = "chat" | "editor";

// ─── Forge Mode Types ───

export type ForgeMode = "default" | "architect" | "socratic" | "challenge" | "plan";

// ─── Editor Types ───

export type ChatStyle = "accent" | "bubble";

export type EditorMode = "chat" | "editor" | "split";

export interface EditorState {
  mode: EditorMode;
  currentFile: string | null;
  cursorLine: number;
  cursorCol: number;
  modified: boolean;
}

export interface EditorIntegration {
  diagnostics: boolean;
  symbols: boolean;
  hover: boolean;
  references: boolean;
  definition: boolean;
  codeActions: boolean;
  editorContext: boolean;
  rename: boolean;
  lspStatus: boolean;
  format: boolean;
}
