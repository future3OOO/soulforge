import { useCallback, useState } from "react";
import type { ForgeMode } from "../types/index.js";

const MODE_ORDER: ForgeMode[] = ["default", "architect", "socratic", "challenge"];

const MODE_LABELS: Record<ForgeMode, string> = {
  default: "Default",
  architect: "Architect",
  socratic: "Socratic",
  challenge: "Challenge",
};

const MODE_COLORS: Record<ForgeMode, string> = {
  default: "#555",
  architect: "#9B30FF",
  socratic: "#FF8C00",
  challenge: "#FF0040",
};

interface ForgeModeState {
  mode: ForgeMode;
  setMode: (mode: ForgeMode) => void;
  cycleMode: () => void;
  modeLabel: string;
  modeColor: string;
}

export function useForgeMode(): ForgeModeState {
  const [mode, setMode] = useState<ForgeMode>("default");

  const cycleMode = useCallback(() => {
    setMode((prev) => {
      const idx = MODE_ORDER.indexOf(prev);
      return MODE_ORDER[(idx + 1) % MODE_ORDER.length] ?? "default";
    });
  }, []);

  return {
    mode,
    setMode,
    cycleMode,
    modeLabel: MODE_LABELS[mode],
    modeColor: MODE_COLORS[mode],
  };
}
