import type { TaskRouter } from "../../types/index.js";

export type TaskType = "planning" | "coding" | "exploration" | "default";

/** Detect the task type from the user's message. */
export function detectTaskType(message: string): TaskType {
  if (message.startsWith("[PLAN MODE]")) return "planning";

  const lower = message.toLowerCase();

  // Exploration patterns — questions, lookups, research
  const explorePatterns =
    /^(what|where|how|why|which|find|search|look|show|list|explain|describe|understand)\b/;
  if (explorePatterns.test(lower)) return "exploration";

  // Coding patterns — implementation, fixes, changes
  const codePatterns =
    /^(add|create|implement|fix|update|change|modify|refactor|rename|delete|remove|write|build|move|extract|migrate|replace|convert)\b/;
  if (codePatterns.test(lower)) return "coding";

  return "default";
}

/**
 * Resolve which model ID to use for a given task type.
 * Falls back: taskRouter[taskType] → taskRouter.default → activeModel.
 */
export function resolveTaskModel(
  taskType: TaskType,
  taskRouter: TaskRouter | undefined,
  activeModel: string,
): string {
  if (!taskRouter) return activeModel;
  const specific = taskRouter[taskType];
  if (specific) return specific;
  return taskRouter.default ?? activeModel;
}
