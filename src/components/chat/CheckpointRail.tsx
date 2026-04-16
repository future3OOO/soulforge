import { useTerminalDimensions } from "@opentui/react";
import { memo, useMemo } from "react";
import { useTheme } from "../../core/theme/index.js";
import type { Checkpoint } from "../../stores/checkpoints.js";
import { SPINNER_FRAMES, useSpinnerFrame } from "../layout/shared.js";

interface CheckpointRailProps {
  checkpoints: Checkpoint[];
  viewing: number | null;
  isLoading: boolean;
}

const DOT = "●";
const DOT_EMPTY = "○";
const DIAMOND = "◆";
const CONNECTOR = "│";

function getDotChar(
  cp: Checkpoint,
  isViewing: boolean,
  isLatest: boolean,
  isLive: boolean,
  spinnerFrame: number,
  t: ReturnType<typeof useTheme>,
): { char: string; color: string } {
  if (cp.status === "running")
    return {
      char: SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length] ?? "⠋",
      color: t.brandSecondary,
    };
  if (isViewing) return { char: DOT, color: t.warning };
  if (cp.undone) return { char: DOT_EMPTY, color: t.textFaint };
  if (isLive && isLatest) return { char: DIAMOND, color: t.brand };
  if (cp.filesEdited.length > 0) return { char: DOT, color: t.textMuted };
  return { char: DOT_EMPTY, color: t.textFaint };
}

export const CheckpointRail = memo(function CheckpointRail({
  checkpoints,
  viewing,
}: CheckpointRailProps) {
  const t = useTheme();
  const spinnerFrame = useSpinnerFrame();
  const { height: termHeight } = useTerminalDimensions();
  const isLive = viewing === null;
  const showNav = checkpoints.length > 1;

  const lastActiveIdx = useMemo(() => {
    for (let i = checkpoints.length - 1; i >= 0; i--) {
      if (!checkpoints[i]?.undone) return checkpoints[i]?.index ?? -1;
    }
    return -1;
  }, [checkpoints]);

  const navRows = showNav ? 2 : 0;
  const availableForDots = Math.max(1, termHeight - 6 - navRows);

  const { visibleCps, hiddenAbove, hiddenBelow } = useMemo(() => {
    const totalNeeded = checkpoints.length * 2 - 1;
    if (totalNeeded <= availableForDots) {
      return { visibleCps: checkpoints, hiddenAbove: 0, hiddenBelow: 0 };
    }

    // How many fit? Reserve 2 rows for +N indicators (top + bottom)
    let maxVisible = 1;
    for (let n = checkpoints.length; n >= 1; n--) {
      if (n * 2 - 1 <= availableForDots - 2) {
        maxVisible = n;
        break;
      }
    }
    maxVisible = Math.max(1, maxVisible);

    // When live, pin to bottom; when viewing, center on viewed checkpoint
    let start: number;
    let end: number;
    if (viewing === null) {
      end = checkpoints.length;
      start = Math.max(0, end - maxVisible);
    } else {
      const focusIdx = checkpoints.findIndex((c) => c.index === viewing);
      const focus = focusIdx >= 0 ? focusIdx : checkpoints.length - 1;
      start = Math.max(0, focus - Math.floor(maxVisible / 2));
      end = start + maxVisible;
      if (end > checkpoints.length) {
        end = checkpoints.length;
        start = Math.max(0, end - maxVisible);
      }
    }

    return {
      visibleCps: checkpoints.slice(start, end),
      hiddenAbove: start,
      hiddenBelow: checkpoints.length - end,
    };
  }, [checkpoints, availableForDots, viewing]);

  // Build flat row array: each row is one character (dot or connector)
  const rows = useMemo(() => {
    const result: Array<{ key: string; char: string; color: string }> = [];
    for (let i = 0; i < visibleCps.length; i++) {
      const cp = visibleCps[i]!;
      const isLatest = cp.index === lastActiveIdx;
      const style = getDotChar(cp, viewing === cp.index, isLatest, isLive, spinnerFrame, t);
      result.push({ key: `d${String(cp.index)}`, char: style.char, color: style.color });
      if (i < visibleCps.length - 1) {
        result.push({ key: `c${String(cp.index)}`, char: CONNECTOR, color: t.textSubtle });
      }
    }
    return result;
  }, [visibleCps, lastActiveIdx, viewing, isLive, spinnerFrame, t]);

  if (checkpoints.length === 0) return null;

  // Cap height: dot area (dots + indicators) must not exceed availableForDots
  const indicatorRows = (hiddenAbove > 0 ? 1 : 0) + (hiddenBelow > 0 ? 1 : 0);
  const dotArea = Math.min(rows.length + indicatorRows, availableForDots);
  const totalHeight = navRows + dotArea;

  return (
    <box
      width={3}
      height={totalHeight}
      flexShrink={0}
      flexDirection="column"
      alignItems="center"
      justifyContent="flex-end"
    >
      {showNav && <text fg={t.textMuted}>▲</text>}
      {hiddenAbove > 0 && <text fg={t.textDim}>+{String(hiddenAbove)}</text>}
      {rows.map((row) => (
        <text key={row.key} fg={row.color}>
          {row.char}
        </text>
      ))}
      {hiddenBelow > 0 && <text fg={t.textDim}>+{String(hiddenBelow)}</text>}
      {showNav && <text fg={t.textMuted}>▼</text>}
    </box>
  );
});
