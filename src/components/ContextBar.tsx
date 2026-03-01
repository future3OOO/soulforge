import { Text } from "ink";
import { useEffect, useState } from "react";
import type { ContextManager } from "../core/context/manager.js";

const BAR_WIDTH = 12;
const MAX_CONTEXT_CHARS = 12_288; // 12k chars ~ roughly 3k tokens

function getBarColor(pct: number): string {
  if (pct < 50) return "#2d5";
  if (pct < 75) return "#FF8C00";
  return "#FF0040";
}

interface Props {
  contextManager: ContextManager;
  chatChars: number;
}

export function ContextBar({ contextManager, chatChars }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((p) => p + 1), 2_000);
    return () => clearInterval(interval);
  }, []);

  const breakdown = contextManager.getContextBreakdown();
  const systemChars = breakdown.reduce((sum, s) => sum + s.chars, 0);
  const totalChars = systemChars + chatChars;
  const pct = Math.min(100, Math.round((totalChars / MAX_CONTEXT_CHARS) * 100));

  const filled = Math.round((pct / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const barColor = getBarColor(pct);
  const pulse = pct > 80 && tick % 2 === 0;

  const totalKb = (totalChars / 1024).toFixed(1);

  return (
    <Text wrap="truncate">
      <Text color="#555">ctx</Text>
      <Text color="#333">[</Text>
      <Text color={pulse ? "#FF0040" : barColor}>{"█".repeat(filled)}</Text>
      <Text color="#222">{"░".repeat(empty)}</Text>
      <Text color="#333">]</Text>
      <Text color={barColor}>
        {String(pct)}% {totalKb}k
      </Text>
    </Text>
  );
}
