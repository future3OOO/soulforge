import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";
import { hasToolCall, stepCountIs, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import { EPHEMERAL_CACHE } from "../llm/provider-options.js";
import { buildSubagentExploreTools, wrapWithBusCache } from "../tools/index.js";
import type { AgentBus } from "./agent-bus.js";
import { buildBusTools } from "./bus-tools.js";
import { buildPrepareStep, buildSymbolLookup, tokenBudget } from "./step-utils.js";
import { repairToolCall } from "./stream-options.js";

function exploreBase(): string {
  return [
    "Explore agent. Read-only codebase research. Only call tools when necessary.",
    "",
    "Tool results and cache are always current. Data from tools is authoritative — never re-read to verify.",
    "Task file paths are pre-resolved from the Repo Map — go directly to them.",
    "Two examples confirming a pattern = confirmed. Stop and call done.",
    "",
    "EXTRACTION (task has file paths + symbols): read_code for named symbols, read_file for config/full files. Use line ranges when given. Call done.",
    "DISCOVERY (task has keywords, no paths): one navigate workspace_symbols → read_code on result. If nothing, one grep. One search, one read.",
    "INVESTIGATION (find patterns across files): soul_grep count → soul_analyze → read only the hits. Breadth-first, not file-by-file.",
    "WEB RESEARCH: go straight to web_search.",
    "",
    "TOOL SELECTION: one symbol → read_code. Multiple symbols or full file → read_file once (no chunking). Pattern frequency → soul_grep count. Structure → soul_analyze.",
    "",
    "STEP BUDGET: You have ~15 tool calls max. Reserve the last call for done. If you've read 10+ files, call done NOW with what you have — partial results beat no results.",
    "",
    'OUTPUT CONTRACT: Parent is BLIND to your tool results — only sees your done call. Paste full code in keyFindings[].detail. Descriptions like "it uses a map" are worthless — paste the actual code. If the parent has to re-read your files, your done call failed.',
  ].join("\n");
}

const exploreDoneTool = tool({
  description:
    "Call when research is complete. The parent agent ONLY sees what you put here — your tool results are invisible to it. Paste full function bodies, type definitions, and implementations. A summary without code forces the parent to re-read everything.",
  inputSchema: z.object({
    summary: z.string().describe("Direct answer to the task question with key conclusions"),
    filesExamined: z.array(z.string()).describe("File paths you examined"),
    keyFindings: z
      .array(
        z.object({
          file: z.string(),
          detail: z
            .string()
            .min(10)
            .describe(
              "PASTE the actual code: full function bodies, complete type definitions, entire relevant blocks. The parent makes decisions from this text alone.",
            ),
          lineNumbers: z.string().optional(),
        }),
      )
      .min(1, "At least one key finding with actual code is required")
      .describe("Each finding with pasteable code"),
  }),
});

interface ExploreAgentOptions {
  bus?: AgentBus;
  agentId?: string;
  providerOptions?: ProviderOptions;
  headers?: Record<string, string>;
  webSearchModel?: LanguageModel;
  onApproveWebSearch?: (query: string) => Promise<boolean>;
  onApproveFetchPage?: (url: string) => Promise<boolean>;
  repoMap?: import("../intelligence/repo-map.js").RepoMap;
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
    done: exploreDoneTool,
  };

  return new ToolLoopAgent({
    id: options?.agentId ?? "explore",
    model,
    tools: allTools,
    instructions: {
      role: "system" as const,
      content: (() => {
        const base = exploreBase();
        return hasBus
          ? `${base}\nCoordination: report_finding to share discoveries. Peer findings appear in tool results — check_findings for detail.`
          : base;
      })(),
      providerOptions: EPHEMERAL_CACHE,
    },
    stopWhen: [stepCountIs(17), tokenBudget(80_000), hasToolCall("done")],
    prepareStep: buildPrepareStep({
      bus,
      agentId,
      role: "explore",
      allTools,
      symbolLookup: buildSymbolLookup(options?.repoMap),
    }),
    experimental_repairToolCall: repairToolCall,
    ...(options?.providerOptions && Object.keys(options.providerOptions).length > 0
      ? { providerOptions: options.providerOptions }
      : {}),
    ...(options?.headers ? { headers: options.headers } : {}),
  });
}
