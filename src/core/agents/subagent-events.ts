export interface SubagentStep {
  parentToolCallId: string;
  toolName: string;
  args?: string;
  state: "running" | "done" | "error";
  /** Agent ID within a multi-agent group (e.g. "researcher-1") */
  agentId?: string;
}

/** Emitted when a multi_agent dispatch starts/progresses/completes */
export interface MultiAgentEvent {
  parentToolCallId: string;
  type: "dispatch-start" | "agent-start" | "agent-done" | "agent-error" | "dispatch-done";
  agentId?: string;
  role?: "explore" | "code";
  task?: string;
  /** Total agents in the group */
  totalAgents?: number;
  /** Number completed so far */
  completedAgents?: number;
  /** Number of findings shared on the bus */
  findingCount?: number;
  error?: string;
}

type StepListener = (step: SubagentStep) => void;
type MultiAgentListener = (event: MultiAgentEvent) => void;

const stepListeners = new Set<StepListener>();
const multiAgentListeners = new Set<MultiAgentListener>();

export function emitSubagentStep(step: SubagentStep): void {
  for (const fn of stepListeners) fn(step);
}

export function onSubagentStep(fn: StepListener): () => void {
  stepListeners.add(fn);
  return () => {
    stepListeners.delete(fn);
  };
}

export function emitMultiAgentEvent(event: MultiAgentEvent): void {
  for (const fn of multiAgentListeners) fn(event);
}

export function onMultiAgentEvent(fn: MultiAgentListener): () => void {
  multiAgentListeners.add(fn);
  return () => {
    multiAgentListeners.delete(fn);
  };
}
