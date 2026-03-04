import { Box, Text } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type MultiAgentEvent,
  onMultiAgentEvent,
  onSubagentStep,
  type SubagentStep,
} from "../core/agents/subagent-events.js";
import {
  CATEGORY_COLORS,
  TOOL_CATEGORIES,
  TOOL_ICON_COLORS,
  TOOL_ICONS,
  TOOL_LABELS,
} from "../core/tool-display.js";
import type { PlanOutput } from "../types/index.js";
import { DiffView } from "./DiffView.js";
import { StructuredPlanView } from "./StructuredPlanView.js";
import { SPINNER_FRAMES } from "./shared.js";

export interface LiveToolCall {
  id: string;
  toolName: string;
  state: "running" | "done" | "error";
  args?: string;
  result?: string;
  error?: string;
}

// ─── Subagent names ───
const SUBAGENT_NAMES = new Set(["dispatch"]);

// ─── Colors ───
const COLORS = {
  spinnerActive: "#FF0040",
  toolNameActive: "#9B30FF",
  argsActive: "#aaa",
  checkDone: "#2d5",
  textDone: "#555",
  error: "#f44",
} as const;

function formatArgs(toolName: string, args?: string): string {
  if (!args) return "";
  try {
    const parsed = JSON.parse(args);
    if (toolName === "read_file" && parsed.path) return parsed.path;
    if (toolName === "edit_file" && parsed.path) return parsed.path;
    if (toolName === "shell" && parsed.command) {
      const cmd = String(parsed.command);
      return cmd.length > 60 ? `${cmd.slice(0, 57)}...` : cmd;
    }
    if (toolName === "grep" && parsed.pattern) return `/${parsed.pattern}/`;
    if (toolName === "glob" && parsed.pattern) return parsed.pattern;
    if (toolName === "web_search" && parsed.query) {
      const q = String(parsed.query);
      return q.length > 50 ? `${q.slice(0, 47)}...` : q;
    }
    if (toolName === "memory_write" && parsed.summary) {
      const s = String(parsed.summary);
      return s.length > 50 ? `${s.slice(0, 47)}...` : s;
    }
    if (toolName === "dispatch" && parsed.tasks) {
      const tasks = parsed.tasks as Array<{ task: string }>;
      if (tasks.length === 1 && tasks[0]) {
        const t = String(tasks[0].task);
        return t.length > 50 ? `${t.slice(0, 47)}...` : t;
      }
      const obj = parsed.objective ? String(parsed.objective) : `${String(tasks.length)} agents`;
      const label = parsed.objective ? `${String(tasks.length)} agents — ${obj}` : obj;
      return label.length > 60 ? `${label.slice(0, 57)}...` : label;
    }
    if (toolName === "editor_read" && parsed.startLine) {
      return `lines ${String(parsed.startLine)}-${String(parsed.endLine ?? "end")}`;
    }
    if (toolName === "editor_edit" && parsed.startLine) {
      return `lines ${String(parsed.startLine)}-${String(parsed.endLine)}`;
    }
    if (toolName === "editor_navigate") {
      if (parsed.file) return String(parsed.file);
      if (parsed.search) return `/${String(parsed.search)}/`;
      if (parsed.line) return `line ${String(parsed.line)}`;
    }
    if (toolName === "editor_hover" && parsed.line) {
      return `line ${String(parsed.line)}:${String(parsed.col ?? "")}`;
    }
    if (toolName === "plan" && parsed.title) {
      return String(parsed.title);
    }
    if (toolName === "update_plan_step" && parsed.stepId) {
      return `${String(parsed.stepId)} → ${String(parsed.status ?? "")}`;
    }
    if (toolName === "ask_user" && parsed.question) {
      const q = String(parsed.question);
      return q.length > 50 ? `${q.slice(0, 47)}...` : q;
    }
    if (toolName === "read_code" && parsed.file) {
      const label = parsed.name
        ? `${String(parsed.name)} in ${String(parsed.file)}`
        : String(parsed.file);
      return label.length > 50 ? `${label.slice(0, 47)}...` : label;
    }
    if (toolName === "navigate") {
      const parts = [parsed.action, parsed.symbol, parsed.file].filter(Boolean).map(String);
      const label = parts.join(" ");
      return label.length > 50 ? `${label.slice(0, 47)}...` : label;
    }
    if (toolName === "analyze") {
      const parts = [parsed.action, parsed.symbol ?? parsed.file].filter(Boolean).map(String);
      const label = parts.join(" ");
      return label.length > 50 ? `${label.slice(0, 47)}...` : label;
    }
    if (toolName === "refactor") {
      const parts = [parsed.action, parsed.symbol].filter(Boolean).map(String);
      const label = parts.join(" ");
      return label.length > 50 ? `${label.slice(0, 47)}...` : label;
    }
    if (toolName === "write_plan") return ".soulforge/plan.md";
    if (toolName === "git_commit" && parsed.message) {
      const m = String(parsed.message);
      return m.length > 50 ? `${m.slice(0, 47)}...` : m;
    }
    if (toolName === "git_log" && parsed.count) return `last ${String(parsed.count)}`;
    if (toolName === "git_diff") return parsed.staged ? "staged" : "unstaged";
    if (toolName === "git_stash") return parsed.pop ? "pop" : "push";
    if (toolName === "code_execution") {
      if (parsed.code) {
        const code = String(parsed.code);
        return code.length > 60 ? `${code.slice(0, 57)}...` : code;
      }
      if (parsed.command) {
        const cmd = String(parsed.command);
        return cmd.length > 60 ? `${cmd.slice(0, 57)}...` : cmd;
      }
    }
  } catch {
    // partial JSON during streaming — don't show raw JSON
  }
  return "";
}

function formatResult(toolName: string, result?: string): string {
  if (!result) return "";
  // Subagent results are plain text summaries — show truncated
  if (SUBAGENT_NAMES.has(toolName)) {
    const lines = result.split("\n").length;
    if (lines > 1) return `${String(lines)} lines`;
    return result.length > 40 ? `${result.slice(0, 37)}...` : result;
  }
  // Code execution — show stdout line count or exit code
  if (toolName === "code_execution") {
    const lines = result.split("\n").length;
    if (lines > 1) return `${String(lines)} lines output`;
    return result.length > 40 ? `${result.slice(0, 37)}...` : result;
  }
  try {
    const parsed = JSON.parse(result);
    if (parsed.output) {
      const out = String(parsed.output);
      const lines = out.split("\n").length;
      if (lines > 1) return `${String(lines)} lines`;
      return out.length > 40 ? `${out.slice(0, 37)}...` : out;
    }
    if (parsed.error) return String(parsed.error).slice(0, 50);
    if (parsed.branch !== undefined) {
      const parts = [parsed.branch as string];
      const counts: string[] = [];
      if (Array.isArray(parsed.staged) && parsed.staged.length > 0)
        counts.push(`${String(parsed.staged.length)} staged`);
      if (Array.isArray(parsed.modified) && parsed.modified.length > 0)
        counts.push(`${String(parsed.modified.length)} modified`);
      if (Array.isArray(parsed.untracked) && parsed.untracked.length > 0)
        counts.push(`${String(parsed.untracked.length)} untracked`);
      if (counts.length > 0) parts.push(counts.join(", "));
      else if (parsed.isDirty === false) parts.push("clean");
      return parts.join(" · ");
    }
    if (parsed.ok !== undefined) {
      const label = parsed.ok ? "ok" : "failed";
      if (parsed.output) {
        const firstLine = String(parsed.output).split("\n")[0] ?? "";
        const out = firstLine.length > 30 ? `${firstLine.slice(0, 27)}...` : firstLine;
        return out ? `${label} · ${out}` : label;
      }
      return label;
    }
  } catch {
    // fallback
  }
  const lines = result.split("\n").length;
  if (lines > 3) return `${String(lines)} lines`;
  return result.length > 40 ? `${result.slice(0, 37)}...` : result;
}

// ─── Spinner ───
function Spinner({ color }: { color?: string }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIdx((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return <Text color={color ?? COLORS.spinnerActive}>{SPINNER_FRAMES[idx]}</Text>;
}

// ─── Elapsed Timer ───
function useElapsedTimers(calls: LiveToolCall[]) {
  const startTimes = useRef(new Map<string, number>());
  const [elapsed, setElapsed] = useState(new Map<string, number>());

  useEffect(() => {
    for (const call of calls) {
      if (call.state === "running" && !startTimes.current.has(call.id)) {
        startTimes.current.set(call.id, Date.now());
      }
    }
  }, [calls]);

  useEffect(() => {
    const hasRunning = calls.some((c) => c.state === "running");
    if (!hasRunning) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const next = new Map<string, number>();
      for (const call of calls) {
        const start = startTimes.current.get(call.id);
        if (start) {
          next.set(call.id, Math.floor((now - start) / 1000));
        }
      }
      setElapsed(next);
    }, 1000);
    return () => clearInterval(interval);
  }, [calls]);

  return elapsed;
}

// ─── Duration Formatter ───
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${String(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${String(mins)}m ${String(secs)}s` : `${String(mins)}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${String(hrs)}h ${String(remMins)}m` : `${String(hrs)}h`;
}

// ─── Status Icon ───
function StatusIcon({ state }: { state: LiveToolCall["state"] }) {
  if (state === "running") return <Spinner />;
  if (state === "done") return <Text color={COLORS.checkDone}>✓</Text>;
  return <Text color={COLORS.error}>✗</Text>;
}

// ─── Subagent child steps hook ───
function useSubagentSteps(parentId: string | null) {
  const [steps, setSteps] = useState<SubagentStep[]>([]);

  useEffect(() => {
    if (!parentId) return;
    setSteps([]);
    return onSubagentStep((step) => {
      if (step.parentToolCallId !== parentId) return;
      setSteps((prev) => {
        // Replace running step with done/error, or append new
        const existing = prev.findIndex(
          (s) => s.toolName === step.toolName && s.args === step.args && s.state === "running",
        );
        if (existing >= 0 && step.state !== "running") {
          const next = [...prev];
          next[existing] = step;
          return next;
        }
        // Keep only last 4 steps visible
        const next = [...prev, step];
        return next.length > 5 ? next.slice(-5) : next;
      });
    });
  }, [parentId]);

  return steps;
}

// ─── Subagent child step row ───
function ChildStepRow({ step }: { step: SubagentStep }) {
  const icon = TOOL_ICONS[step.toolName] ?? "\uF0AD";
  const iconColor = TOOL_ICON_COLORS[step.toolName] ?? "#666";
  const label = TOOL_LABELS[step.toolName] ?? step.toolName;
  const category = TOOL_CATEGORIES[step.toolName];
  const categoryColor = category ? CATEGORY_COLORS[category] : undefined;
  const isDone = step.state !== "running";

  return (
    <Box height={1} flexShrink={0} marginLeft={3}>
      <Text wrap="truncate">
        <Text color="#333">├ </Text>
        {step.state === "running" ? (
          <Spinner color="#666" />
        ) : step.state === "done" ? (
          <Text color="#2d5">✓</Text>
        ) : (
          <Text color="#f44">✗</Text>
        )}
        <Text color={isDone ? "#444" : iconColor}> {icon} </Text>
        {category ? <Text color={isDone ? "#333" : categoryColor}>[{category}] </Text> : null}
        <Text color={isDone ? "#444" : "#888"}>{label}</Text>
        {step.agentId ? <Text color={isDone ? "#333" : "#9B30FF"}> [{step.agentId}]</Text> : null}
        {step.args ? <Text color={isDone ? "#333" : "#666"}> {step.args}</Text> : null}
      </Text>
    </Box>
  );
}

// ─── Multi-Agent progress tracking ───
interface MultiAgentState {
  totalAgents: number;
  agents: Map<
    string,
    { role: string; task: string; state: "pending" | "running" | "done" | "error" }
  >;
  findingCount: number;
}

function useMultiAgentProgress(parentId: string | null) {
  const [state, setState] = useState<MultiAgentState | null>(null);

  useEffect(() => {
    if (!parentId) return;
    setState(null);

    return onMultiAgentEvent((event: MultiAgentEvent) => {
      if (event.parentToolCallId !== parentId) return;

      setState((prev) => {
        const s: MultiAgentState = prev ?? {
          totalAgents: event.totalAgents ?? 0,
          agents: new Map(),
          findingCount: 0,
        };

        if (event.type === "dispatch-start") {
          return { ...s, totalAgents: event.totalAgents ?? 0 };
        }
        if (event.type === "agent-start" && event.agentId) {
          const next = new Map(s.agents);
          next.set(event.agentId, {
            role: event.role ?? "explore",
            task: event.task ?? "",
            state: "running",
          });
          return { ...s, agents: next };
        }
        if (event.type === "agent-done" && event.agentId) {
          const next = new Map(s.agents);
          const existing = next.get(event.agentId);
          if (existing) next.set(event.agentId, { ...existing, state: "done" });
          return { ...s, agents: next, findingCount: event.findingCount ?? s.findingCount };
        }
        if (event.type === "agent-error" && event.agentId) {
          const next = new Map(s.agents);
          const existing = next.get(event.agentId);
          if (existing) next.set(event.agentId, { ...existing, state: "error" });
          return { ...s, agents: next };
        }
        return s;
      });
    });
  }, [parentId]);

  return state;
}

// ─── Multi-Agent Row (child of ToolRow for multi-agent dispatch calls) ───
function MultiAgentChildRow({
  agentId,
  info,
  isLast,
  childSteps,
}: {
  agentId: string;
  info: { role: string; task: string; state: string };
  isLast: boolean;
  childSteps: SubagentStep[];
}) {
  const roleIcon = info.role === "explore" ? "\uDB80\uDE29" : "\uDB80\uDD69";
  const roleColor = "#9B30FF";
  const isDone = info.state === "done" || info.state === "error";
  const taskStr = info.task.length > 40 ? `${info.task.slice(0, 37)}...` : info.task;
  const connector = isLast && childSteps.length === 0 ? "└ " : "├ ";
  const continuation = isLast ? "  " : "│ ";

  return (
    <>
      <Box height={1} flexShrink={0} marginLeft={3}>
        <Text wrap="truncate">
          <Text color="#333">{connector}</Text>
          {info.state === "running" ? (
            <Spinner color={roleColor} />
          ) : info.state === "done" ? (
            <Text color="#2d5">✓</Text>
          ) : info.state === "error" ? (
            <Text color="#f44">✗</Text>
          ) : (
            <Text color="#555">○</Text>
          )}
          <Text color={isDone ? "#444" : roleColor}> {roleIcon} </Text>
          <Text color={isDone ? "#444" : "#ddd"} bold={!isDone}>
            {agentId}
          </Text>
          <Text color={isDone ? "#333" : "#666"}> {taskStr}</Text>
        </Text>
      </Box>
      {childSteps.map((step, i) => {
        const stepIcon = TOOL_ICONS[step.toolName] ?? "\uF0AD";
        const stepColor = TOOL_ICON_COLORS[step.toolName] ?? "#666";
        const stepLabel = TOOL_LABELS[step.toolName] ?? step.toolName;
        const stepDone = step.state !== "running";
        const stepLast = i === childSteps.length - 1;
        const stepConnector = stepLast ? "└ " : "├ ";

        return (
          <Box key={`${step.toolName}-${String(i)}`} height={1} flexShrink={0} marginLeft={3}>
            <Text wrap="truncate">
              <Text color="#333">
                {continuation}
                {"  "}
                {stepConnector}
              </Text>
              {step.state === "running" ? (
                <Spinner color="#666" />
              ) : step.state === "done" ? (
                <Text color="#2d5">✓</Text>
              ) : (
                <Text color="#f44">✗</Text>
              )}
              <Text color={stepDone ? "#444" : stepColor}> {stepIcon} </Text>
              <Text color={stepDone ? "#444" : "#888"}>{stepLabel}</Text>
              {step.args ? <Text color={stepDone ? "#333" : "#666"}> {step.args}</Text> : null}
            </Text>
          </Box>
        );
      })}
    </>
  );
}

// ─── Regular Tool Call Row ───
function ToolRow({ tc, seconds }: { tc: LiveToolCall; seconds?: number }) {
  const isSubagent = SUBAGENT_NAMES.has(tc.toolName);
  // Detect multi-agent dispatch (more than 1 task in args)
  const isMultiAgent = useMemo(() => {
    if (tc.toolName !== "dispatch" || !tc.args) return false;
    try {
      const parsed = JSON.parse(tc.args);
      return Array.isArray(parsed.tasks) && parsed.tasks.length > 1;
    } catch {
      return false;
    }
  }, [tc.toolName, tc.args]);
  const childSteps = useSubagentSteps(
    isSubagent && !isMultiAgent && tc.state === "running" ? tc.id : null,
  );
  const multiAgentChildSteps = useSubagentSteps(
    isMultiAgent && tc.state === "running" ? tc.id : null,
  );
  const multiProgress = useMultiAgentProgress(
    isMultiAgent && tc.state === "running" ? tc.id : null,
  );

  const icon = TOOL_ICONS[tc.toolName] ?? "\uF0AD"; // wrench fallback
  const label = TOOL_LABELS[tc.toolName] ?? tc.toolName;
  const argStr = formatArgs(tc.toolName, tc.args);
  const isDone = tc.state !== "running";

  // Parse edit_file args for DiffView when done
  const editDiff = useMemo(() => {
    if (tc.toolName !== "edit_file" || tc.state !== "done" || !tc.args) return null;
    try {
      const parsed = JSON.parse(tc.args);
      if (
        typeof parsed.path === "string" &&
        typeof parsed.oldString === "string" &&
        typeof parsed.newString === "string"
      ) {
        return {
          path: parsed.path as string,
          oldString: parsed.oldString as string,
          newString: parsed.newString as string,
        };
      }
    } catch {
      // partial or invalid JSON
    }
    return null;
  }, [tc.toolName, tc.state, tc.args]);

  // Build suffix
  let suffix = "";
  if (tc.state === "running" && seconds != null && seconds > 0) {
    if (isMultiAgent && multiProgress) {
      const done = [...multiProgress.agents.values()].filter(
        (a) => a.state === "done" || a.state === "error",
      ).length;
      suffix = ` ${formatDuration(seconds)} · ${String(done)}/${String(multiProgress.totalAgents)} agents`;
      if (multiProgress.findingCount > 0) {
        suffix += ` · ${String(multiProgress.findingCount)} findings`;
      }
    } else {
      suffix = ` ${formatDuration(seconds)}`;
    }
  } else if (tc.state === "done" && tc.result && !editDiff) {
    suffix = ` → ${formatResult(tc.toolName, tc.result)}`;
  } else if (tc.state === "error" && tc.error) {
    suffix = ` → ${tc.error.slice(0, 50)}`;
  }

  // Check if result indicates success (for DiffView)
  const editSuccess = useMemo(() => {
    if (!editDiff || !tc.result) return false;
    try {
      const parsed = JSON.parse(tc.result);
      return parsed.success === true;
    } catch {
      return false;
    }
  }, [editDiff, tc.result]);

  const editError = useMemo(() => {
    if (!editDiff || !tc.result) return undefined;
    try {
      const parsed = JSON.parse(tc.result);
      if (!parsed.success && parsed.error) return parsed.error as string;
    } catch {
      // ignore
    }
    return undefined;
  }, [editDiff, tc.result]);

  const iconColor = TOOL_ICON_COLORS[tc.toolName] ?? "#888";
  const category = TOOL_CATEGORIES[tc.toolName];
  const categoryColor = category ? CATEGORY_COLORS[category] : undefined;

  return (
    <Box flexDirection="column">
      <Box height={1} flexShrink={0}>
        <Text wrap="truncate">
          <StatusIcon state={tc.state} />
          <Text color={isDone ? COLORS.textDone : iconColor}> {icon} </Text>
          {category ? <Text color={isDone ? "#444" : categoryColor}>[{category}] </Text> : null}
          <Text color={isDone ? COLORS.textDone : COLORS.toolNameActive} bold={!isDone}>
            {label}
          </Text>
          {argStr ? (
            <Text color={isDone ? COLORS.textDone : COLORS.argsActive}> {argStr}</Text>
          ) : null}
          {suffix ? (
            <Text color={tc.state === "error" ? COLORS.error : COLORS.textDone}>{suffix}</Text>
          ) : null}
        </Text>
      </Box>
      {editDiff ? (
        <Box marginLeft={2}>
          <DiffView
            filePath={editDiff.path}
            oldString={editDiff.oldString}
            newString={editDiff.newString}
            success={editSuccess}
            errorMessage={editError}
          />
        </Box>
      ) : null}
      {/* Multi-agent: show per-agent progress with nested tool steps */}
      {isMultiAgent && multiProgress && multiProgress.agents.size > 0 && (
        <Box flexDirection="column">
          {[...multiProgress.agents.entries()].map(([agentId, info], idx, arr) => {
            const agentSteps = multiAgentChildSteps.filter((s) => s.agentId === agentId);
            return (
              <MultiAgentChildRow
                key={agentId}
                agentId={agentId}
                info={info}
                isLast={idx === arr.length - 1}
                childSteps={agentSteps}
              />
            );
          })}
        </Box>
      )}
      {/* Single subagent: show child steps */}
      {isSubagent && !isMultiAgent && childSteps.length > 0 && (
        <Box flexDirection="column">
          {childSteps.map((step, i) => (
            <ChildStepRow key={`${step.toolName}-${String(i)}`} step={step} />
          ))}
        </Box>
      )}
    </Box>
  );
}

// ─── Main Display ───
interface Props {
  calls: LiveToolCall[];
}

export function ToolCallDisplay({ calls }: Props) {
  const elapsed = useElapsedTimers(calls);

  if (calls.length === 0) return null;

  return (
    <Box flexDirection="column">
      {calls.map((tc) => {
        const seconds = elapsed.get(tc.id);
        // Render structured plan view when write_plan completes
        if (tc.toolName === "write_plan" && tc.state === "done" && tc.args) {
          try {
            const plan = JSON.parse(tc.args) as PlanOutput;
            if (plan.title && plan.steps) {
              return <StructuredPlanView key={tc.id} plan={plan} />;
            }
          } catch {
            // Fall through to normal row
          }
        }
        return <ToolRow key={tc.id} tc={tc} seconds={seconds} />;
      })}
    </Box>
  );
}
