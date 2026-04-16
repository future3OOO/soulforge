import { useTerminalDimensions } from "@opentui/react";
import { memo, useMemo } from "react";
import { icon } from "../../core/icons.js";
import { useTheme } from "../../core/theme/index.js";
import type { Checkpoint } from "../../stores/checkpoints.js";
import { SPINNER_FRAMES, useSpinnerFrame } from "../layout/shared.js";

interface CheckpointRailProps {
  checkpoints: Checkpoint[];
  viewing: number | null;
  isLoading: boolean;
}

function getDotStyle(
  cp: Checkpoint,
  isViewing: boolean,
  isLatest: boolean,
  spinnerFrame: number,
  t: ReturnType<typeof useTheme>,
): { char: string; color: string } {
  if (isViewing) return { char: icon("circle_dot"), color: t.warning };
  if (cp.undone) return { char: icon("circle_empty"), color: t.textFaint };
  if (cp.status === "running")
    return {
      char: SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length] ?? "⠋",
      color: t.brandSecondary,
    };
  if (isLatest) return { char: icon("circle_dot"), color: t.brand };
  if (cp.filesEdited.length > 0) return { char: icon("circle_dot"), color: t.brandAlt };
  return { char: icon("circle_dot"), color: t.textMuted };
}

/** Each checkpoint = 1 dot + 1 connector, last one = dot only */
function cpRows(n: number): number {
  return n <= 0 ? 0 : n * 2 - 1;
}

export const CheckpointRail = memo(function CheckpointRail({
  checkpoints,
  viewing,
}: CheckpointRailProps) {
  const t = useTheme();
  const spinnerFrame = useSpinnerFrame();
  const { height: termHeight } = useTerminalDimensions();

  const lastActiveIdx = useMemo(() => {
    for (let i = checkpoints.length - 1; i >= 0; i--) {
      if (!checkpoints[i]?.undone) return checkpoints[i]?.index ?? -1;
    }
    return -1;
  }, [checkpoints]);

  // Available rows for dots: terminal height minus chrome
  const availableRows = Math.max(3, termHeight - 10);

  const { visibleCps, hiddenAbove, hiddenBelow } = useMemo(() => {
    const totalNeeded = cpRows(checkpoints.length);
    if (totalNeeded <= availableRows) {
      return { visibleCps: checkpoints, hiddenAbove: 0, hiddenBelow: 0 };
    }

    // How many checkpoints fit? Reserve 1 row each for +N indicators
    let maxVisible = 1;
    for (let n = checkpoints.length; n >= 1; n--) {
      if (cpRows(n) <= availableRows - 2) {
        maxVisible = n;
        break;
      }
    }
    maxVisible = Math.max(1, maxVisible);

    // Center window around viewed/latest checkpoint
    const focusIdx =
      viewing !== null ? checkpoints.findIndex((c) => c.index === viewing) : checkpoints.length - 1;
    const focus = focusIdx >= 0 ? focusIdx : checkpoints.length - 1;

    let start = Math.max(0, focus - Math.floor(maxVisible / 2));
    let end = start + maxVisible;
    if (end > checkpoints.length) {
      end = checkpoints.length;
      start = Math.max(0, end - maxVisible);
    }

    return {
      visibleCps: checkpoints.slice(start, end),
      hiddenAbove: start,
      hiddenBelow: checkpoints.length - end,
    };
  }, [checkpoints, availableRows, viewing]);

  if (checkpoints.length === 0) return null;

  return (
    <box
      width={5}
      flexGrow={1}
      flexShrink={0}
      flexDirection="column"
      alignItems="center"
      paddingX={1}
    >
      <text fg={t.textSubtle}>^B</text>
      {/* Connector fills space above dots */}
      <box flexGrow={1} flexShrink={1} minHeight={0} alignItems="center" overflow="hidden">
        <text fg={t.textSubtle}>{Array.from({ length: 200 }, () => "│").join("\n")}</text>
      </box>
      {/* +N above */}
      {hiddenAbove > 0 && <text fg={t.textDim}>+{String(hiddenAbove)}</text>}
      {/* Visible dots */}
      {visibleCps.map((cp, idx) => {
        const isLatest = cp.index === lastActiveIdx;
        const { char, color } = getDotStyle(cp, viewing === cp.index, isLatest, spinnerFrame, t);
        const isLast = idx === visibleCps.length - 1;
        return (
          <box
            key={`cp${String(cp.index)}`}
            flexDirection="column"
            alignItems="center"
            flexShrink={0}
          >
            <text fg={color}>{char}</text>
            {!isLast && <text fg={t.textSubtle}>│</text>}
          </box>
        );
      })}
      {/* +N below */}
      {hiddenBelow > 0 && <text fg={t.textDim}>+{String(hiddenBelow)}</text>}
      <text fg={t.textSubtle}>^F</text>
    </box>
  );
});
