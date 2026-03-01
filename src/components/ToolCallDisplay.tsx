import { Box, Text } from "ink";
import { useEffect, useRef, useState } from "react";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface LiveToolCall {
  id: string;
  toolName: string;
  state: "running" | "done" | "error";
  args?: string;
  result?: string;
  error?: string;
}

// ─── Subagent names ───
const SUBAGENT_NAMES = new Set(["explore", "code"]);

// ─── Colors ───
const COLORS = {
  spinnerActive: "#FF0040",
  toolNameActive: "#9B30FF",
  argsActive: "#aaa",
  checkDone: "#2d5",
  textDone: "#555",
  error: "#f44",
  subagentBorder: "#6A0DAD",
  subagentLabel: "#9B30FF",
} as const;

// ─── Tool Icons (nerdfonts) ───
const TOOL_ICONS: Record<string, string> = {
  read_file: "\uDB80\uDCCB", // 󰂋
  edit_file: "\uF040", //
  shell: "\uF120", //
  grep: "\uF002", //
  glob: "\uF07C", //
  explore: "\uDB80\uDE29", // 󰚩 nf-md-robot
  code: "\uDB80\uDD69", // 󰅩 nf-md-code-braces
  web_search: "\uF0AC", // globe
  memory_write: "\uF02E", // bookmark
};

const TOOL_LABELS: Record<string, string> = {
  read_file: "Reading",
  edit_file: "Editing",
  shell: "Running",
  grep: "Searching",
  glob: "Globbing",
  explore: "Exploring",
  code: "Coding",
  web_search: "Searching",
  memory_write: "Recording",
};

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
    if ((toolName === "explore" || toolName === "code") && parsed.task) {
      const task = String(parsed.task);
      return task.length > 50 ? `${task.slice(0, 47)}...` : task;
    }
  } catch {
    // partial JSON during streaming
  }
  return args.length > 50 ? `${args.slice(0, 47)}...` : args;
}

function formatResult(toolName: string, result?: string): string {
  if (!result) return "";
  // Subagent results are plain text summaries — show truncated
  if (SUBAGENT_NAMES.has(toolName)) {
    const lines = result.split("\n").length;
    if (lines > 1) return `${String(lines)} lines`;
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
  } catch {
    // fallback
  }
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

// ─── Status Icon ───
function StatusIcon({ state }: { state: LiveToolCall["state"] }) {
  if (state === "running") return <Spinner />;
  if (state === "done") return <Text color={COLORS.checkDone}>✓</Text>;
  return <Text color={COLORS.error}>✗</Text>;
}

// ─── Regular Tool Call Row ───
function ToolRow({ tc, seconds }: { tc: LiveToolCall; seconds?: number }) {
  const icon = TOOL_ICONS[tc.toolName] ?? "\uF0AD"; // wrench fallback
  const label = TOOL_LABELS[tc.toolName] ?? tc.toolName;
  const argStr = formatArgs(tc.toolName, tc.args);
  const isDone = tc.state !== "running";

  // Build suffix
  let suffix = "";
  if (tc.state === "running" && seconds != null && seconds > 0) {
    suffix = ` ${seconds}s`;
  } else if (tc.state === "done" && tc.result) {
    suffix = ` → ${formatResult(tc.toolName, tc.result)}`;
  } else if (tc.state === "error" && tc.error) {
    suffix = ` → ${tc.error.slice(0, 50)}`;
  }

  return (
    <Box height={1} flexShrink={0}>
      <Text wrap="truncate">
        <StatusIcon state={tc.state} />
        <Text color={isDone ? COLORS.textDone : COLORS.spinnerActive}> {icon} </Text>
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
  );
}

// ─── Subagent Block ───
function SubagentBlock({ tc, seconds }: { tc: LiveToolCall; seconds?: number }) {
  const icon = TOOL_ICONS[tc.toolName] ?? "\uDB80\uDE29";
  const label = TOOL_LABELS[tc.toolName] ?? tc.toolName;
  const argStr = formatArgs(tc.toolName, tc.args);
  const isDone = tc.state !== "running";
  const borderChar = "─";
  const headerWidth = 44;

  // Build header: ╭─ 󰚩 Exploring ──────────── 14s
  const labelText = `${icon} ${label}`;
  const timeText = isDone
    ? `${seconds ?? 0}s ✓`
    : seconds != null && seconds > 0
      ? `${seconds}s`
      : "";
  const fillLen = Math.max(0, headerWidth - labelText.length - timeText.length - 6);
  const fill = borderChar.repeat(fillLen);

  // Body text
  let bodyText = "";
  if (tc.state === "running") bodyText = " Working...";
  else if (tc.state === "done" && tc.result) bodyText = ` ${formatResult(tc.toolName, tc.result)}`;
  else if (tc.state === "error" && tc.error) bodyText = ` ${tc.error.slice(0, 60)}`;
  const bodyColor = tc.state === "error" ? COLORS.error : COLORS.textDone;

  return (
    <Box flexDirection="column">
      {/* Header — single line */}
      <Box height={1} flexShrink={0}>
        <Text wrap="truncate">
          <Text color={COLORS.subagentBorder}>╭─ </Text>
          <Text color={COLORS.subagentLabel} bold>
            {icon} {label}
          </Text>
          {argStr ? (
            <Text color={isDone ? COLORS.textDone : COLORS.argsActive}> {argStr}</Text>
          ) : null}
          <Text color={COLORS.subagentBorder}> {fill} </Text>
          <Text color={isDone ? COLORS.checkDone : COLORS.textDone}>{timeText}</Text>
        </Text>
      </Box>
      {/* Body — single line */}
      <Box height={1} flexShrink={0}>
        <Text wrap="truncate">
          <Text color={COLORS.subagentBorder}>│</Text>
          <Text color={bodyColor}>{bodyText}</Text>
        </Text>
      </Box>
      {/* Footer — single line */}
      <Box height={1} flexShrink={0}>
        <Text color={COLORS.subagentBorder} wrap="truncate">
          ╰{borderChar.repeat(headerWidth)}
        </Text>
      </Box>
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
    <Box flexDirection="column" marginLeft={2} marginTop={0}>
      {calls.map((tc) => {
        const seconds = elapsed.get(tc.id);
        if (SUBAGENT_NAMES.has(tc.toolName)) {
          return <SubagentBlock key={tc.id} tc={tc} seconds={seconds} />;
        }
        return <ToolRow key={tc.id} tc={tc} seconds={seconds} />;
      })}
    </Box>
  );
}
