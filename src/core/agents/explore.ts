import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";
import { Output, ToolLoopAgent } from "ai";
import { z } from "zod";
import { EPHEMERAL_CACHE } from "../llm/provider-options.js";
import { buildSubagentExploreTools, wrapWithBusCache } from "../tools/index.js";
import type { AgentBus } from "./agent-bus.js";
import { buildBusTools } from "./bus-tools.js";
import { buildPrepareStep, buildSymbolLookup } from "./step-utils.js";
import { repairToolCall } from "./stream-options.js";

function exploreBase(): string {
  return [
    "Explore agent. Read-only research. Tool results are authoritative — never re-read or re-verify.",
    "TOOL PRIORITY — use the cheapest tool that answers the question:" +
      " Tier 1 (free, instant): soul_find, soul_impact, soul_analyze(file_profile), soul_grep(count)," +
      " navigate(definition/references/call_hierarchy/implementation/type_hierarchy/workspace_symbols)," +
      " analyze(type_info/diagnostics/outline)." +
      " Tier 2 (targeted): read_file(target, name) for one symbol." +
      " Tier 3 (broad): read_file full, grep for string literals." +
      " Exhaust Tier 1 before Tier 2. Three Tier 1 calls replace twenty Tier 3 calls.",
    "Workflow: EXTRACTION (paths given) → read_file(target, name). DISCOVERY (keywords only) → soul_find or navigate, then read hits. TRACING (data flow) → soul_impact + navigate(references), not grep→read chains.",
    "After reading targets, trace one level of callers via navigate(references). Flag disconnects between stated vs actual behavior.",
    'OUTPUT: JSON object {"summary":"...","filesExamined":[...],"keyFindings":[{"file":"...","detail":"paste actual code"}],"gaps":[...],"connections":[...]}. Paste full code in keyFindings — the parent is BLIND to your tool results.',
  ].join("\n");
}

function investigateBase(): string {
  return [
    "Investigation agent. Broad cross-cutting analysis across many files.",
    "TOOL PRIORITY — free tools first:" +
      " soul_grep(count) or soul_analyze to quantify patterns before reading anything." +
      " soul_impact for dependency/cochange analysis." +
      " soul_find for locating files/symbols by concept." +
      " navigate(references/call_hierarchy) for tracing usage." +
      " Only read files that Tier 1 tools pointed you to.",
    "Target paths are pre-resolved. Use soul_grep for pattern matching, soul_analyze for structural queries (unused exports, symbol frequency, file profiles), soul_impact for dependency analysis.",
    "Quantify findings: counts, percentages, file lists. Flag inconsistencies between files.",
    'OUTPUT: JSON object {"summary":"...","filesExamined":[...],"keyFindings":[{"file":"...","detail":"paste evidence"}],"gaps":[...],"connections":[...]}. Paste actual code/data, not descriptions.',
  ].join("\n");
}

const exploreOutputSchema = z.object({
  summary: z.string().describe("Direct answer to the task question with key conclusions"),
  filesExamined: z.array(z.string()).describe("File paths you examined"),
  keyFindings: z
    .array(
      z.object({
        file: z.string(),
        detail: z
          .string()
          .describe("PASTE actual code: full function bodies, type definitions, relevant blocks"),
        lineNumbers: z.string().optional(),
      }),
    )
    .describe("Each finding with pasteable code"),
  gaps: z
    .array(z.string())
    .optional()
    .describe(
      "Disconnects: missing enforcement, stated vs actual behavior, unhandled edge cases, dead code paths",
    ),
  connections: z
    .array(z.string())
    .optional()
    .describe(
      "Cross-cutting: symbols, configs, or APIs in your files that also appear in peer agents' targets",
    ),
});

const exploreOutput = Output.object({
  name: "research_result",
  description:
    "Structured research result. Paste full code in keyFindings — the parent is BLIND to your tool results.",
  schema: exploreOutputSchema,
});

interface ExploreAgentOptions {
  bus?: AgentBus;
  agentId?: string;
  parentToolCallId?: string;
  providerOptions?: ProviderOptions;
  headers?: Record<string, string>;
  webSearchModel?: LanguageModel;
  onApproveWebSearch?: (query: string) => Promise<boolean>;
  onApproveFetchPage?: (url: string) => Promise<boolean>;
  repoMap?: import("../intelligence/repo-map.js").RepoMap;
  contextWindow?: number;
  disablePruning?: boolean;
  role?: "explore" | "investigate";
}

export function createExploreAgent(model: LanguageModel, options?: ExploreAgentOptions) {
  const bus = options?.bus;
  const agentId = options?.agentId;
  const hasBus = !!(bus && agentId);
  const busTools = hasBus ? buildBusTools(bus, agentId, "explore") : {};

  let tools = buildSubagentExploreTools({
    webSearchModel: options?.webSearchModel,
    onApproveWebSearch: options?.onApproveWebSearch,
    onApproveFetchPage: options?.onApproveFetchPage,
    repoMap: options?.repoMap,
  });
  if (hasBus) {
    tools = wrapWithBusCache(tools, bus, agentId, options?.repoMap) as typeof tools;
  }

  const allTools = {
    ...tools,
    ...busTools,
  };

  const { prepareStep, stopConditions } = buildPrepareStep({
    bus,
    agentId,
    parentToolCallId: options?.parentToolCallId,
    role: "explore",
    allTools,
    symbolLookup: buildSymbolLookup(options?.repoMap),
    contextWindow: options?.contextWindow,
    disablePruning: options?.disablePruning,
  });

  return new ToolLoopAgent({
    id: options?.agentId ?? "explore",
    model,
    tools: allTools,
    instructions: {
      role: "system" as const,
      content: (() => {
        const isInvestigate = options?.role === "investigate";
        const base = isInvestigate ? investigateBase() : exploreBase();
        return hasBus
          ? `${base}\nCoordination: report_finding after discoveries — especially shared symbols/configs with peer targets. check_findings for peer detail.`
          : base;
      })(),
      providerOptions: EPHEMERAL_CACHE,
    },
    output: exploreOutput,
    stopWhen: stopConditions,
    prepareStep,
    experimental_repairToolCall: repairToolCall,
    ...(options?.providerOptions && Object.keys(options.providerOptions).length > 0
      ? { providerOptions: options.providerOptions }
      : {}),
    ...(options?.headers ? { headers: options.headers } : {}),
  });
}
