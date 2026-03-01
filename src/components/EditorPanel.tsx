import { Box, Text } from "ink";
import { useEffect, useRef, useState } from "react";
import type { ScreenSegment } from "../core/editor/screen.js";
import { UI_ICONS } from "../core/icons.js";

interface Props {
  isOpen: boolean;
  fileName: string | null;
  screenLines: ScreenSegment[][];
  defaultBg?: string;
  modeName?: string;
  focused?: boolean;
  onClosed?: () => void;
}

type Direction = "opening" | "closing" | "idle";

const MODE_COLORS: Record<string, string> = {
  normal: "#6A0DAD",
  insert: "#00AA00",
  visual: "#FF8C00",
  "visual line": "#FF8C00",
  "visual block": "#FF8C00",
  replace: "#FF0040",
  command: "#4488FF",
  cmdline_normal: "#4488FF",
  terminal: "#888888",
};

function modeLabel(mode: string): string {
  if (mode.startsWith("cmdline")) return "COMMAND";
  return mode.toUpperCase().replace("_", " ");
}

export function EditorPanel({
  isOpen,
  fileName,
  screenLines,
  defaultBg,
  modeName = "normal",
  focused = false,
  onClosed,
}: Props) {
  const [animFrame, setAnimFrame] = useState(0);
  const [direction, setDirection] = useState<Direction>("idle");
  const [closing, setClosing] = useState(false);
  const prevOpen = useRef(isOpen);

  if (isOpen && !prevOpen.current) {
    prevOpen.current = true;
    if (direction !== "opening") {
      setDirection("opening");
      setAnimFrame(0);
    }
  } else if (!isOpen && prevOpen.current) {
    prevOpen.current = false;
    if (!closing) {
      setClosing(true);
      setDirection("idle");
    }
  }

  const ANIMATION_FRAMES = ["  ░", " ░▒", "░▒▓", "▒▓█", "▓██", "███"];

  useEffect(() => {
    if (direction !== "opening") return;
    const interval = setInterval(() => {
      setAnimFrame((prev) => {
        if (prev >= ANIMATION_FRAMES.length - 1) {
          clearInterval(interval);
          setDirection("idle");
          return prev;
        }
        return prev + 1;
      });
    }, 60);
    return () => clearInterval(interval);
  }, [direction, ANIMATION_FRAMES.length]);

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => {
      setClosing(false);
      onClosed?.();
    }, 400);
    return () => clearTimeout(timer);
  }, [closing, onClosed]);

  if (!isOpen && !closing && direction === "idle") {
    return null;
  }

  const borderColor = focused ? "#FF0040" : "#6A0DAD";

  // Opening / closing — full-size centered message (no layout collapse)
  if (direction === "opening" || closing) {
    return (
      <Box
        flexDirection="column"
        width="60%"
        borderStyle="round"
        borderColor={closing ? "#333" : borderColor}
        alignItems="center"
        justifyContent="center"
      >
        {closing ? (
          <Text color="#444" dimColor>
            closing forge...
          </Text>
        ) : (
          <>
            <Text color="#9B30FF">{ANIMATION_FRAMES[animFrame]}</Text>
            <Text color="#444" dimColor>
              loading forge...
            </Text>
          </>
        )}
      </Box>
    );
  }

  const displayName = fileName ? (fileName.split("/").pop() ?? fileName) : "no file";
  const bg = defaultBg ?? "#000000";
  const modeColor = MODE_COLORS[modeName] ?? "#6A0DAD";

  return (
    <Box flexDirection="column" width="60%" borderStyle="round" borderColor={borderColor}>
      {/* Title bar */}
      <Box paddingX={1} justifyContent="space-between" flexShrink={0} height={1}>
        <Box>
          <Text backgroundColor={focused ? "#FF0040" : "#6A0DAD"} color="white" bold>
            {` ${UI_ICONS.editor} `}
          </Text>
          <Text color="#888"> {displayName}</Text>
        </Box>
        <Text>
          <Text color={modeColor}>{"\uE0B6"}</Text>
          <Text backgroundColor={modeColor} color="white" bold>
            {` ${modeLabel(modeName)} `}
          </Text>
          <Text color={modeColor}>{"\uE0B4"}</Text>
        </Text>
      </Box>
      {/* Separator */}
      <Box paddingX={1} flexShrink={0} height={1}>
        <Text color="#333">{"─".repeat(200)}</Text>
      </Box>

      {/* Neovim screen */}
      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        {screenLines.length === 0 ? (
          <Box justifyContent="center" alignItems="center" flexGrow={1}>
            <Text color="#333">waiting for nvim...</Text>
          </Box>
        ) : (
          screenLines.map((segments, row) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable screen rows
            <Box key={row}>
              {segments.map((seg, j) => {
                const segKey = `${row}-${j}`;
                return (
                  <Text
                    key={segKey}
                    color={seg.fg}
                    backgroundColor={seg.bg ?? bg}
                    bold={seg.bold}
                    italic={seg.italic}
                  >
                    {seg.text}
                  </Text>
                );
              })}
            </Box>
          ))
        )}
      </Box>

      {/* Separator */}
      <Box paddingX={1} flexShrink={0} height={1}>
        <Text color="#333">{"─".repeat(200)}</Text>
      </Box>
      {/* Bottom bar */}
      <Box paddingX={1} justifyContent="space-between" flexShrink={0} height={1}>
        <Text color="#555" wrap="truncate">
          {fileName ?? ""}
        </Text>
        <Text color="#555" bold>
          nvim
        </Text>
      </Box>
    </Box>
  );
}
