import { icon } from "../../core/icons.js";
import { useTheme } from "../../core/theme/index.js";
import { SPINNER_FRAMES, useSpinnerFrame } from "../layout/shared.js";
import { Markdown } from "./Markdown.js";

const brainIcon = () => icon("brain");

interface Props {
  content: string;
  expanded: boolean;
  isStreaming?: boolean;
  id: string;
}

function ThinkingSpinner() {
  const t = useTheme();
  const frame = useSpinnerFrame();
  return <text fg={t.brandDim}>{SPINNER_FRAMES[frame]}</text>;
}

export function ReasoningBlock({ content, expanded, isStreaming, id }: Props) {
  const t = useTheme();
  const lines = content.split("\n");
  const lineCount = lines.length;

  if (!expanded) {
    if (isStreaming) {
      return (
        <box key={`${id}-col`} height={1} flexShrink={0} flexDirection="row">
          <ThinkingSpinner />
          <text fg={t.textFaint}> {brainIcon()} reasoning</text>
          {lineCount > 1 && <text fg={t.textFaint}> ({String(lineCount)} lines)</text>}
          <text fg={t.textSubtle}> ^O</text>
        </box>
      );
    }
    const firstLine = (lines[0] ?? "").trim().replace(/\*\*/g, "");
    const preview = firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
    return (
      <box key={`${id}-col`} height={1} flexShrink={0}>
        <text fg={t.textFaint} truncate>
          <span fg={t.success}>✓</span> {brainIcon()}{" "}
          <span fg={t.textFaint}>{preview || "Reasoned"}</span>
          {lineCount > 1 && <span fg={t.textFaint}> ({String(lineCount)} lines)</span>}
          <span fg={t.textFaint}> ^O</span>
        </text>
      </box>
    );
  }

  const bc = isStreaming ? t.brandDim : t.border;
  const label = isStreaming ? "reasoning…" : "reasoning";
  const trimmed = content.trim();

  return (
    <box
      key={`${id}-exp`}
      flexDirection="column"
      flexShrink={0}
      border
      borderStyle="rounded"
      borderColor={bc}
    >
      <box
        height={1}
        flexShrink={0}
        paddingX={1}
        backgroundColor={t.bgElevated}
        alignSelf="flex-start"
        marginTop={-1}
      >
        <text truncate>
          <span fg={t.brandDim}>{brainIcon()}</span> <span fg={t.brandDim}>{label}</span>
          <span fg={t.textFaint}> ^O</span>
        </text>
      </box>
      <box flexDirection="column" paddingX={1}>
        <Markdown text={trimmed} streaming={isStreaming} />
      </box>
    </box>
  );
}
