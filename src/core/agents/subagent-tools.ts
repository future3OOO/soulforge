import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { LanguageModel } from "ai";
import { tool } from "ai";
import { z } from "zod";
import { AgentBus, type AgentTask } from "./agent-bus.js";
import { createCodeAgent } from "./code.js";
import { createExploreAgent } from "./explore.js";
import { emitMultiAgentEvent, emitSubagentStep } from "./subagent-events.js";

interface SubagentModels {
  defaultModel: LanguageModel;
  explorationModel?: LanguageModel;
  codingModel?: LanguageModel;
  providerOptions?: ProviderOptions;
  headers?: Record<string, string>;
}

function formatToolArgs(toolCall: { toolName: string; input?: unknown }): string {
  const a = (toolCall.input ?? {}) as Record<string, unknown>;
  if (toolCall.toolName === "read_file" && a.path) return String(a.path);
  if (toolCall.toolName === "grep" && a.pattern) return `/${String(a.pattern)}/`;
  if (toolCall.toolName === "glob" && a.pattern) return String(a.pattern);
  if (toolCall.toolName === "shell" && a.command) {
    const cmd = String(a.command);
    return cmd.length > 50 ? `${cmd.slice(0, 47)}...` : cmd;
  }
  if (toolCall.toolName === "edit_file" && a.path) return String(a.path);
  return "";
}

/** Build step-reporting callbacks for a subagent */
function buildStepCallbacks(parentToolCallId: string, agentId?: string) {
  return {
    experimental_onToolCallStart: (event: { toolCall?: { toolName: string; input?: unknown } }) => {
      const tc = event.toolCall;
      if (!tc) return;
      emitSubagentStep({
        parentToolCallId,
        toolName: tc.toolName,
        args: formatToolArgs(tc),
        state: "running",
        agentId,
      });
    },
    experimental_onToolCallFinish: (event: {
      toolCall?: { toolName: string; input?: unknown };
      success?: boolean;
    }) => {
      const tc = event.toolCall;
      if (!tc) return;
      emitSubagentStep({
        parentToolCallId,
        toolName: tc.toolName,
        args: formatToolArgs(tc),
        state: event.success ? "done" : "error",
        agentId,
      });
    },
  };
}

/**
 * Run a single agent task, reporting progress and posting results to the bus.
 */
async function runAgentTask(
  task: AgentTask,
  models: SubagentModels,
  bus: AgentBus,
  parentToolCallId: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  // Wait for dependencies if specified
  if (task.dependsOn && task.dependsOn.length > 0) {
    await Promise.all(task.dependsOn.map((dep) => bus.waitForAgent(dep)));
  }

  emitMultiAgentEvent({
    parentToolCallId,
    type: "agent-start",
    agentId: task.agentId,
    role: task.role,
    task: task.task,
  });

  // Inject peer context into the task prompt
  const peerFindings = bus.summarizeFindings(task.agentId);
  const depResults = task.dependsOn
    ?.map((dep) => {
      const r = bus.getResult(dep);
      return r ? `[${dep}] completed:\n${r.result}` : null;
    })
    .filter(Boolean)
    .join("\n\n");

  let enrichedPrompt = task.task;
  if (depResults) {
    enrichedPrompt += `\n\n--- Dependency results ---\n${depResults}`;
  }
  if (peerFindings !== "No findings from peer agents yet.") {
    enrichedPrompt += `\n\n--- Peer findings so far ---\n${peerFindings}`;
  }

  try {
    const agent =
      task.role === "explore"
        ? createExploreAgent(models.explorationModel ?? models.defaultModel, {
            bus,
            agentId: task.agentId,
            providerOptions: models.providerOptions,
            headers: models.headers,
          })
        : createCodeAgent(models.codingModel ?? models.defaultModel, {
            bus,
            agentId: task.agentId,
            providerOptions: models.providerOptions,
            headers: models.headers,
          });

    const result = await agent.generate({
      prompt: enrichedPrompt,
      abortSignal,
      ...buildStepCallbacks(parentToolCallId, task.agentId),
    });

    bus.setResult({
      agentId: task.agentId,
      role: task.role,
      task: task.task,
      result: result.text,
      success: true,
    });

    emitMultiAgentEvent({
      parentToolCallId,
      type: "agent-done",
      agentId: task.agentId,
      role: task.role,
      completedAgents: bus.completedAgentIds.length,
      findingCount: bus.findingCount,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    bus.setResult({
      agentId: task.agentId,
      role: task.role,
      task: task.task,
      result: errMsg,
      success: false,
      error: errMsg,
    });

    emitMultiAgentEvent({
      parentToolCallId,
      type: "agent-error",
      agentId: task.agentId,
      role: task.role,
      error: errMsg,
    });
  }
}

/**
 * Unified `dispatch` tool — replaces explore, code, and multi_agent.
 * Handles 1–10 agents with a minimal schema.
 */
export function buildSubagentTools(models: SubagentModels) {
  return {
    dispatch: tool({
      description:
        "Dispatch 1–10 subagents for research or coding tasks. " +
        "Each task gets its own agent with a fresh context window. " +
        "All agents share a coordination bus for real-time findings. " +
        "Tasks without `dependsOn` run immediately in parallel; tasks with dependencies wait. " +
        "Use role 'explore' (default) for read-only research, 'code' for implementation.",
      inputSchema: z.object({
        tasks: z
          .array(
            z.object({
              task: z.string().describe("What the agent should do"),
              role: z
                .enum(["explore", "code"])
                .default("explore")
                .describe("Agent type (default: explore)"),
              id: z.string().optional().describe("Unique ID (auto-generated if omitted)"),
              dependsOn: z
                .array(z.string())
                .optional()
                .describe("IDs of tasks that must complete first"),
            }),
          )
          .min(1)
          .max(10)
          .describe("Agent tasks to dispatch"),
        objective: z
          .string()
          .optional()
          .describe("High-level objective (useful for multi-agent coordination)"),
      }),
      execute: async (args, { abortSignal, toolCallId }) => {
        const bus = new AgentBus();

        const tasks: AgentTask[] = args.tasks.map((t, i) => ({
          agentId: t.id ?? `agent-${String(i + 1)}`,
          role: t.role,
          task: t.task,
          dependsOn: t.dependsOn,
        }));

        const isSingle = tasks.length === 1;

        if (!isSingle) {
          emitMultiAgentEvent({
            parentToolCallId: toolCallId,
            type: "dispatch-start",
            totalAgents: tasks.length,
          });
        }

        if (isSingle) {
          const task = tasks[0] as AgentTask;
          const agent =
            task.role === "explore"
              ? createExploreAgent(models.explorationModel ?? models.defaultModel, {
                  bus,
                  agentId: task.agentId,
                  providerOptions: models.providerOptions,
                  headers: models.headers,
                })
              : createCodeAgent(models.codingModel ?? models.defaultModel, {
                  bus,
                  agentId: task.agentId,
                  providerOptions: models.providerOptions,
                  headers: models.headers,
                });

          const result = await agent.generate({
            prompt: task.task,
            abortSignal,
            ...buildStepCallbacks(toolCallId),
          });
          return result.text;
        }

        const promises = tasks.map((task) =>
          runAgentTask(task, models, bus, toolCallId, abortSignal),
        );
        await Promise.all(promises);

        emitMultiAgentEvent({
          parentToolCallId: toolCallId,
          type: "dispatch-done",
          totalAgents: tasks.length,
          completedAgents: bus.completedAgentIds.length,
          findingCount: bus.findingCount,
        });

        const results = bus.getAllResults();
        const successful = results.filter((r) => r.success);
        const failed = results.filter((r) => !r.success);

        const sections: string[] = [];
        const heading = args.objective ?? "Dispatch";
        sections.push(`## ${heading}`);
        sections.push(
          `**${String(successful.length)}/${String(tasks.length)}** agents completed successfully.`,
        );

        if (bus.findingCount > 0) {
          sections.push(`**${String(bus.findingCount)}** findings shared on the coordination bus.`);
        }

        for (const r of results) {
          const status = r.success ? "✓" : "✗";
          sections.push(
            `\n### ${status} Agent: ${r.agentId} (${r.role})\n**Task:** ${r.task}\n\n${r.result}`,
          );
        }

        if (failed.length > 0) {
          sections.push(
            `\n### Errors\n${failed.map((r) => `- ${r.agentId}: ${r.error}`).join("\n")}`,
          );
        }

        return sections.join("\n");
      },
    }),
  };
}
