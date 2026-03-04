import { Box, Text } from "ink";
import { useEffect, useMemo, useState } from "react";
import {
  TOOL_CATEGORIES,
  TOOL_ICON_COLORS,
  TOOL_ICONS,
  TOOL_LABELS,
} from "../core/tool-display.js";
import type {
  ChatMessage,
  ChatStyle,
  MessageSegment,
  PlanOutput,
  ToolCall,
} from "../types/index.js";
import { DiffView } from "./DiffView.js";
import { Markdown } from "./Markdown.js";
import { ReasoningBlock } from "./ReasoningBlock.js";
import { StructuredPlanView } from "./StructuredPlanView.js";

// ─── Constants ───
const REVEAL_INTERVAL = 30;
const MAX_REVEAL_STEPS = 15;
const CURSOR_CHAR = "\u2588"; // █
const USER_COLOR = "#FF0040";
const ASSISTANT_COLOR = "#9B30FF";
const SYSTEM_COLOR = "#555";
const ERROR_COLOR = "#f44";
interface Props {
  messages: ChatMessage[];
  chatStyle: ChatStyle;
}

// ─── Helpers ───

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: true,
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatToolSummary(tc: ToolCall): string {
  if (tc.name === "read_file" && typeof tc.args.path === "string") return String(tc.args.path);
  if (tc.name === "edit_file" && typeof tc.args.path === "string") return String(tc.args.path);
  if (tc.name === "shell" && typeof tc.args.command === "string") {
    const cmd = String(tc.args.command);
    return cmd.length > 60 ? `${cmd.slice(0, 57)}...` : cmd;
  }
  if (tc.name === "grep" && typeof tc.args.pattern === "string")
    return `/${String(tc.args.pattern)}/`;
  if (tc.name === "glob" && typeof tc.args.pattern === "string") return String(tc.args.pattern);
  if (tc.name === "web_search" && typeof tc.args.query === "string") {
    const q = String(tc.args.query);
    return q.length > 50 ? `${q.slice(0, 47)}...` : q;
  }
  return "";
}

// ─── SystemMessage ───

function SystemMessage({ msg, animate = true }: { msg: ChatMessage; animate?: boolean }) {
  const time = formatTime(msg.timestamp);
  const text = msg.content;
  const isError =
    text.startsWith("Error:") || text.startsWith("Request failed:") || text.startsWith("Failed");
  const railColor = isError ? ERROR_COLOR : SYSTEM_COLOR;
  const textColor = isError ? "#e88" : "#777";
  const chunkSize = Math.max(1, Math.ceil(text.length / MAX_REVEAL_STEPS));
  const totalSteps = Math.ceil(text.length / chunkSize);
  const [step, setStep] = useState(animate ? 0 : totalSteps);
  const [done, setDone] = useState(!animate);

  useEffect(() => {
    if (done) return;
    if (step >= totalSteps) {
      setDone(true);
      return;
    }
    const timer = setTimeout(() => setStep((s) => s + 1), REVEAL_INTERVAL);
    return () => clearTimeout(timer);
  }, [step, totalSteps, done]);

  const visibleText = done ? text : text.slice(0, step * chunkSize);
  const lines = visibleText.split("\n");

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header */}
      <Box>
        <Text color={railColor}>▏ </Text>
        {isError ? (
          <Text color={ERROR_COLOR} bold>
            ✗ Error
          </Text>
        ) : (
          <Text color={SYSTEM_COLOR}> System</Text>
        )}
        <Text color="#333"> · {time}</Text>
      </Box>
      {/* Content with rail */}
      {lines.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable line order
        <Box key={i}>
          <Text color={railColor}>▏ </Text>
          <Text color={textColor}>{line}</Text>
        </Box>
      ))}
      {!done && (
        <Box>
          <Text color={railColor}>▏ </Text>
          <Text color={railColor}>{CURSOR_CHAR}</Text>
        </Box>
      )}
    </Box>
  );
}

// ─── Tools that are UI meta-operations (collapsed to minimal display) ───
const META_TOOLS = new Set(["plan", "update_plan_step", "ask_user", "editor_panel"]);

// ─── ToolCallRow (non-edit) ───

function ToolCallRow({ tc }: { tc: ToolCall }) {
  const icon = TOOL_ICONS[tc.name] ?? "\uF0AD";
  const iconColor = TOOL_ICON_COLORS[tc.name] ?? "#888";
  const label = TOOL_LABELS[tc.name] ?? tc.name;
  const category = TOOL_CATEGORIES[tc.name];
  const argStr = formatToolSummary(tc);
  const statusIcon = tc.result ? (tc.result.success ? "✓" : "✗") : "●";
  const statusColor = tc.result ? (tc.result.success ? "#2d5" : "#f44") : "#666";
  const resultText = tc.result
    ? tc.result.success
      ? "ok"
      : (tc.result.error ?? "error")
    : "pending";

  return (
    <Box height={1} flexShrink={0}>
      <Text wrap="truncate">
        <Text color={statusColor}>{statusIcon} </Text>
        <Text color={iconColor}>{icon} </Text>
        {category ? <Text color="#444">[{category}] </Text> : null}
        <Text color="#999">{label}</Text>
        {argStr ? <Text color="#777"> {argStr}</Text> : null}
        <Text color="#555"> → </Text>
        <Text color={statusColor}>{resultText}</Text>
      </Text>
    </Box>
  );
}

// ─── Collapsed tool group: groups consecutive meta-tool calls into a single line ───

function CollapsedToolGroup({ calls }: { calls: ToolCall[] }) {
  const count = calls.length;
  const allOk = calls.every((tc) => tc.result?.success);
  return (
    <Box height={1} flexShrink={0}>
      <Text wrap="truncate">
        <Text color={allOk ? "#2d5" : "#f44"}>{allOk ? "✓" : "✗"} </Text>
        <Text color="#777">
          {String(count)} tool call{count > 1 ? "s" : ""} (
          {calls.map((tc) => TOOL_LABELS[tc.name] ?? tc.name).join(", ")})
        </Text>
      </Text>
    </Box>
  );
}

// ─── EditToolCall (with DiffView) ───

function EditToolCall({ tc }: { tc: ToolCall }) {
  const hasDiff =
    typeof tc.args.path === "string" &&
    typeof tc.args.oldString === "string" &&
    typeof tc.args.newString === "string";

  if (!hasDiff) return <ToolCallRow tc={tc} />;

  return (
    <DiffView
      filePath={tc.args.path as string}
      oldString={tc.args.oldString as string}
      newString={tc.args.newString as string}
      success={tc.result?.success ?? false}
      errorMessage={tc.result?.error}
    />
  );
}

// ─── WritePlanCall (structured plan view) ───

function parsePlanOutput(tc: ToolCall): PlanOutput | null {
  if (tc.name !== "write_plan" || !tc.result?.success) return null;
  const a = tc.args;
  if (typeof a.title === "string" && Array.isArray(a.files) && Array.isArray(a.steps)) {
    return a as unknown as PlanOutput;
  }
  return null;
}

function WritePlanCall({ tc }: { tc: ToolCall }) {
  const plan = parsePlanOutput(tc);
  if (!plan) return <ToolCallRow tc={tc} />;
  return <StructuredPlanView plan={plan} />;
}

// ─── UserMessage (accent mode) ───

function UserMessageAccent({ msg }: { msg: ChatMessage }) {
  const time = formatTime(msg.timestamp);
  const lines = msg.content.split("\n");

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={USER_COLOR}>▌ </Text>
        <Text color={USER_COLOR} bold>
          You
        </Text>
        <Text color="#333"> · {time}</Text>
      </Box>
      {lines.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable line order
        <Box key={i}>
          <Text color={USER_COLOR}>▌ </Text>
          <Text color="#eee">{line}</Text>
        </Box>
      ))}
    </Box>
  );
}

// ─── UserMessage (bubble mode) ───

function UserMessageBubble({ msg }: { msg: ChatMessage }) {
  const time = formatTime(msg.timestamp);

  return (
    <Box flexDirection="column" alignItems="flex-end" marginBottom={1}>
      <Box borderStyle="round" borderColor={USER_COLOR} paddingX={1}>
        <Text color="#eee">{msg.content}</Text>
      </Box>
      <Text color="#555"> You · {time}</Text>
    </Box>
  );
}

// ─── AssistantMessage ───

function renderSegments(segments: MessageSegment[], toolCallMap: Map<string, ToolCall>) {
  return segments.map((seg, i) => {
    // Add spacing between different segment types (e.g. tools → text)
    const prev = i > 0 ? segments[i - 1] : null;
    const needsGap = prev && prev.type !== seg.type;

    if (seg.type === "text") {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable segment order
        <Box key={`text-${i}`} flexDirection="column" marginTop={needsGap ? 1 : 0}>
          <Markdown text={seg.content} color="#ccc" />
        </Box>
      );
    }
    if (seg.type === "reasoning") {
      return <ReasoningBlock key={seg.id} content={seg.content} expanded={false} />;
    }
    if (seg.type === "plan") {
      const doneSteps = seg.plan.steps.filter((s) => s.status === "done").length;
      const totalSteps = seg.plan.steps.length;
      const planKey = `plan-${seg.plan.title.slice(0, 20)}-${String(seg.plan.createdAt)}`;
      return (
        <Box
          key={planKey}
          flexShrink={0}
          marginTop={needsGap ? 1 : 0}
          borderStyle="bold"
          borderLeft
          borderTop={false}
          borderBottom={false}
          borderRight={false}
          borderColor="#00BFFF"
          paddingLeft={1}
        >
          <Text wrap="truncate">
            <Text color="#2d5">✓ </Text>
            <Text color="#00BFFF">{TOOL_ICONS.plan} </Text>
            <Text color="#999">Plan: {seg.plan.title} </Text>
            <Text color="#666">
              ({String(doneSteps)}/{String(totalSteps)} steps)
            </Text>
          </Text>
        </Box>
      );
    }
    const calls = seg.toolCallIds
      .map((id: string) => toolCallMap.get(id))
      .filter(Boolean) as ToolCall[];
    if (calls.length === 0) return null;

    // Group consecutive meta-tool calls for collapsing
    const groups: { type: "normal"; tc: ToolCall }[] | { type: "meta"; calls: ToolCall[] }[] = [];
    let metaBuf: ToolCall[] = [];
    const flushMeta = () => {
      if (metaBuf.length > 0) {
        (groups as { type: "meta"; calls: ToolCall[] }[]).push({ type: "meta", calls: metaBuf });
        metaBuf = [];
      }
    };
    for (const tc of calls) {
      if (META_TOOLS.has(tc.name)) {
        metaBuf.push(tc);
      } else {
        flushMeta();
        (groups as { type: "normal"; tc: ToolCall }[]).push({ type: "normal", tc });
      }
    }
    flushMeta();

    const toolsKey = `tools-${seg.toolCallIds[0] ?? String(i)}`;
    return (
      <Box key={toolsKey} flexDirection="column" marginTop={needsGap ? 1 : 0}>
        {(groups as ({ type: "normal"; tc: ToolCall } | { type: "meta"; calls: ToolCall[] })[]).map(
          (g, gi) => {
            if (g.type === "meta") {
              return <CollapsedToolGroup key={`meta-${String(gi)}`} calls={g.calls} />;
            }
            return (
              <Box key={g.tc.id} flexDirection="column">
                {g.tc.name === "edit_file" ? (
                  <EditToolCall tc={g.tc} />
                ) : g.tc.name === "write_plan" ? (
                  <WritePlanCall tc={g.tc} />
                ) : (
                  <ToolCallRow tc={g.tc} />
                )}
              </Box>
            );
          },
        )}
      </Box>
    );
  });
}

function AssistantMessage({ msg }: { msg: ChatMessage }) {
  const time = formatTime(msg.timestamp);

  // Build tool call lookup
  const toolCallMap = useMemo(() => {
    const map = new Map<string, ToolCall>();
    for (const tc of msg.toolCalls ?? []) {
      map.set(tc.id, tc);
    }
    return map;
  }, [msg.toolCalls]);

  const hasSegments = msg.segments && msg.segments.length > 0;
  const hasContent = msg.content.trim().length > 0;
  const hasTools = msg.toolCalls && msg.toolCalls.length > 0;
  const isEmpty = !hasSegments && !hasContent && !hasTools;

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle="bold"
      borderLeft
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      borderColor={ASSISTANT_COLOR}
      paddingLeft={1}
    >
      {/* Header */}
      <Box>
        <Text color={ASSISTANT_COLOR}>󰚩 Forge</Text>
        <Text color="#333"> · {time}</Text>
      </Box>

      {isEmpty ? (
        <Text color="#555" italic>
          Empty response — model returned no content.
        </Text>
      ) : hasSegments ? (
        renderSegments(msg.segments as MessageSegment[], toolCallMap)
      ) : (
        <>
          {hasContent && <Markdown text={msg.content} color="#ccc" />}
          {hasTools && (
            <Box flexDirection="column">
              {msg.toolCalls?.map((tc) => (
                <Box key={tc.id} flexDirection="column">
                  {tc.name === "edit_file" ? <EditToolCall tc={tc} /> : <ToolCallRow tc={tc} />}
                </Box>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

// ─── Main Component ───

export function MessageList({ messages, chatStyle }: Props) {
  // Find the last system message index so only it gets the reveal animation
  const lastSystemIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "system") return i;
    }
    return -1;
  }, [messages]);

  if (messages.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1} width="100%">
        <Box marginTop={1}>
          <Text color="#555" italic>
            No messages yet. Type below to start.
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} width="100%">
      {messages.map((msg, idx) => {
        if (msg.role === "system") {
          return <SystemMessage key={msg.id} msg={msg} animate={idx === lastSystemIdx} />;
        }

        if (msg.role === "user") {
          return chatStyle === "bubble" ? (
            <UserMessageBubble key={msg.id} msg={msg} />
          ) : (
            <UserMessageAccent key={msg.id} msg={msg} />
          );
        }

        return <AssistantMessage key={msg.id} msg={msg} />;
      })}
    </Box>
  );
}
