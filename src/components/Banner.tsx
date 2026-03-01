import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { providerIcon } from "../core/icons.js";
import type { ProviderStatus } from "../core/llm/provider.js";

// ─── Banner Text (clean block letters) ───

const BANNER_LINES = [
  "███████  ██████  ██    ██ ██      ███████  ██████  ██████   ██████  ███████",
  "██      ██    ██ ██    ██ ██      ██      ██    ██ ██   ██ ██       ██     ",
  "███████ ██    ██ ██    ██ ██      █████   ██    ██ ██████  ██  ███  █████  ",
  "     ██ ██    ██ ██    ██ ██      ██      ██    ██ ██   ██ ██    ██ ██     ",
  "███████  ██████   ██████  ███████ ██       ██████  ██   ██  ██████  ███████",
];

const BANNER_HEIGHT = BANNER_LINES.length;
const BANNER_WIDTH = Math.max(...BANNER_LINES.map((l) => l.length));
const PADDED = BANNER_LINES.map((l) => l.padEnd(BANNER_WIDTH));

// ─── Animation Timing ───

const FRAME_MS = 75;
const REVEAL_START = 2;
const FRAMES_PER_LINE = 3;
const REVEAL_END = REVEAL_START + BANNER_HEIGHT * FRAMES_PER_LINE;
const SETTLE_FRAME = REVEAL_END + 4;
const TOTAL_FRAMES = SETTLE_FRAME + 3;

// ─── Colors ───

const BANNER_COLOR = "#9B30FF";
const REVEAL_COLOR = "#FF0040";

// ─── Deterministic PRNG (Mulberry32) ───

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Segment ───

interface Seg {
  text: string;
  color: string;
  bold: boolean;
}

function pushSeg(segs: Seg[], char: string, color: string, bold: boolean) {
  const last = segs[segs.length - 1];
  if (last && last.color === color && last.bold === bold) {
    last.text += char;
  } else {
    segs.push({ text: char, color, bold });
  }
}

// ─── Component ───

interface Props {
  providers: ProviderStatus[];
  activeModel: string;
  hasGateway: boolean;
}

export function Banner({ providers, activeModel, hasGateway: gw }: Props) {
  const [frame, setFrame] = useState(0);

  const animDone = frame >= TOTAL_FRAMES;

  // Drive animation frames
  // biome-ignore lint/correctness/useExhaustiveDependencies: frame triggers the next tick
  useEffect(() => {
    if (animDone) return;
    const timer = setTimeout(() => setFrame((f) => f + 1), FRAME_MS);
    return () => clearTimeout(timer);
  }, [frame, animDone]);

  // How many lines are fully revealed
  const revealedCount =
    frame < REVEAL_START
      ? 0
      : Math.min(BANNER_HEIGHT, Math.floor((frame - REVEAL_START) / FRAMES_PER_LINE) + 1);

  // The line currently flashing in
  const revealingLine =
    !animDone && frame >= REVEAL_START && revealedCount <= BANNER_HEIGHT ? revealedCount - 1 : -1;

  // Sparkle positions for unrevealed rows
  const sparkleMap = new Map<string, { char: string; color: string }>();
  if (!animDone) {
    const rng = mulberry32(frame * 7919);
    const sparkleChars = ["✦", "✧", "·", "∘"];
    const count = frame < REVEAL_START ? frame * 4 : Math.max(0, 4 - (frame - REVEAL_END));

    for (let i = 0; i < count; i++) {
      const row = Math.floor(rng() * BANNER_HEIGHT);
      const col = Math.floor(rng() * BANNER_WIDTH);
      const ci = Math.floor(rng() * sparkleChars.length);
      sparkleMap.set(`${row},${col}`, {
        char: sparkleChars[ci] ?? "·",
        color: rng() > 0.5 ? "#9B30FF" : "#6A0DAD",
      });
    }
  }

  // Build rendered lines
  const renderedLines: Seg[][] = [];

  for (let row = 0; row < BANNER_HEIGHT; row++) {
    const segs: Seg[] = [];

    if (row >= revealedCount && !animDone) {
      // Not revealed — show sparkles
      for (let col = 0; col < BANNER_WIDTH; col++) {
        const sparkle = sparkleMap.get(`${row},${col}`);
        if (sparkle) {
          pushSeg(segs, sparkle.char, sparkle.color, false);
        } else {
          pushSeg(segs, " ", "#111", false);
        }
      }
      renderedLines.push(segs);
      continue;
    }

    // Revealed — render text
    const line = PADDED[row] ?? "";
    const isRevealing = row === revealingLine;
    const color = isRevealing ? REVEAL_COLOR : BANNER_COLOR;

    for (let col = 0; col < line.length; col++) {
      const char = line[col] ?? " ";
      pushSeg(segs, char, color, isRevealing);
    }

    renderedLines.push(segs);
  }

  const showSubtitle = frame >= REVEAL_END || animDone;
  const showHealth = frame >= SETTLE_FRAME || animDone;

  return (
    <Box flexDirection="column" alignItems="center" marginBottom={1}>
      {/* Banner lines */}
      {renderedLines.map((segs, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable animation rows
        <Box key={i}>
          {segs.map((seg, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable segments
            <Text key={j} color={seg.color} bold={seg.bold}>
              {seg.text}
            </Text>
          ))}
        </Box>
      ))}

      {/* Subtitle */}
      {showSubtitle && (
        <>
          <Text color="#666" dimColor>
            {">>> AI-Powered Terminal IDE by proxySoul <<<"}
          </Text>
          <Text color="#444">{"─".repeat(52)}</Text>
        </>
      )}

      {/* Provider health check */}
      {showHealth && (
        <>
          <Box marginTop={1} gap={2}>
            {gw ? (
              <Box gap={1}>
                <Text color="#00FF00" bold>
                  ●
                </Text>
                <Text color="#888">Gateway</Text>
                <Text color="#555">(all models)</Text>
              </Box>
            ) : (
              providers.map((p) => (
                <Box key={p.id} gap={0}>
                  <Text color={p.available ? "#00FF00" : "#FF0040"} bold>
                    {providerIcon(p.id)}
                  </Text>
                  <Text color={p.available ? "#888" : "#444"}> {p.name}</Text>
                </Box>
              ))
            )}
          </Box>

          <Box marginTop={0}>
            <Text color="#555">model: </Text>
            <Text color="#9B30FF" bold>
              {activeModel}
            </Text>
            <Text color="#444"> │ ^L to switch</Text>
          </Box>
        </>
      )}
    </Box>
  );
}
