import { fg as fgStyle, StyledText, TextAttributes, type TextRenderable } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useRef } from "react";
import { icon } from "../../core/icons.js";
import { getThemeTokens } from "../../core/theme/index.js";
import { formatElapsed } from "../../hooks/useElapsed.js";
import { useStatusBarStore } from "../../stores/statusbar.js";

const SCAN_SPEED = 120;

function buildScanContent(pos: number, width: number): StyledText {
  const tk = getThemeTokens();
  const segments: ReturnType<ReturnType<typeof fgStyle>>[] = [];
  for (let i = 0; i < width; i++) {
    const dist = Math.abs(i - pos);
    const color =
      dist === 0
        ? tk.brand
        : dist === 1
          ? tk.brand
          : dist === 2
            ? tk.brandDim
            : tk.bgPopupHighlight;
    const ch = dist === 0 ? "━" : "─";
    segments.push(fgStyle(color)(ch));
  }
  return new StyledText(segments);
}

const FORGE_STATUSES = [
  "Forging response…",
  "Stoking the flames…",
  "Summoning spirits…",
  "Channeling the ether…",
  "Tempering thoughts…",
  "Conjuring words…",
  "Consulting the runes…",
  "Weaving spellwork…",
  "Kindling the forge…",
  "Gathering arcana…",
];

const ghostIcon = () => icon("ghost");
const GHOST_SPEED = 400;

function buildGhostContent(ghostVisible: boolean, isCompacting: boolean): StyledText {
  const tk = getThemeTokens();
  const currentGhost = ghostVisible ? ghostIcon() : " ";
  const ghostColor = isCompacting ? tk.info : tk.brandAlt;
  return new StyledText([fgStyle(ghostColor)(` ${currentGhost} `)]);
}

function buildStatusContent(isCompacting: boolean, forgeStatus: string): StyledText {
  const tk = getThemeTokens();
  const busyStatus = isCompacting ? "Compacting context…" : forgeStatus;
  const statusColor = isCompacting ? tk.info : tk.brand;
  return new StyledText([fgStyle(statusColor)(busyStatus)]);
}

function buildElapsedContent(elapsedSec: number, queueCount: number | undefined): StyledText {
  const tk = getThemeTokens();
  const chunks: ReturnType<ReturnType<typeof fgStyle>>[] = [];
  if (elapsedSec > 0) {
    chunks.push(fgStyle(tk.textMuted)(` ${formatElapsed(elapsedSec)}`));
  }
  if (queueCount != null && queueCount > 0) {
    chunks.push(fgStyle(tk.textMuted)(` (${String(queueCount)} queued)`));
  }
  return new StyledText(chunks);
}

function buildCompletedContent(time: string): StyledText {
  const tk = getThemeTokens();
  return new StyledText([
    fgStyle(tk.success)(" ✓ "),
    fgStyle(tk.textMuted)(`Completed in ${time}`),
  ]);
}

interface LoadingStatusProps {
  isLoading: boolean;
  isCompacting: boolean;
  queueCount?: number;
}

export function LoadingStatus({ isLoading, isCompacting, queueCount }: LoadingStatusProps) {
  const { width: termWidth } = useTerminalDimensions();
  const ghostRef = useRef<TextRenderable>(null);
  const statusRef = useRef<TextRenderable>(null);
  const elapsedRef = useRef<TextRenderable>(null);
  const completedRef = useRef<TextRenderable>(null);
  const scanRef = useRef<TextRenderable>(null);
  const ghostTickRef = useRef(0);
  const forgeStatusRef = useRef("");
  const wasLoadingRef = useRef(false);
  const loadingStartRef = useRef(0);
  const completedTimeRef = useRef<string | null>(null);
  const elapsedSecRef = useRef(0);
  const scanPosRef = useRef(0);
  const scanDirRef = useRef(1);
  const propsRef = useRef({ isLoading, isCompacting, queueCount });
  propsRef.current = { isLoading, isCompacting, queueCount };
  const scanWidth = Math.max(10, Math.floor((termWidth ?? 80) * 0.3));

  const showBusy = isLoading || isCompacting;

  if (isLoading && !wasLoadingRef.current) {
    forgeStatusRef.current = FORGE_STATUSES[
      Math.floor(Math.random() * FORGE_STATUSES.length)
    ] as string;
    loadingStartRef.current = Date.now();
    elapsedSecRef.current = 0;
    completedTimeRef.current = null;
  }

  // Compute completed time synchronously during render (not in useEffect)
  // so the "Completed in Xs" message appears immediately when loading stops.
  if (!isLoading && wasLoadingRef.current && loadingStartRef.current) {
    const finalSec = Math.floor((Date.now() - loadingStartRef.current) / 1000);
    completedTimeRef.current = finalSec > 0 ? formatElapsed(finalSec) : "<1s";
  }

  wasLoadingRef.current = isLoading;

  // Ghost animation — fast interval, only touches ghostRef
  useEffect(() => {
    if (!showBusy) return;
    const timer = setInterval(() => {
      ghostTickRef.current++;
      const { isCompacting: cp } = propsRef.current;
      const ghostVisible = ghostTickRef.current % 4 !== 3;
      try {
        if (ghostRef.current) {
          ghostRef.current.content = buildGhostContent(ghostVisible, cp);
        }
      } catch {}
    }, GHOST_SPEED);
    return () => clearInterval(timer);
  }, [showBusy]);

  // Scan line animation — fast interval, only touches scanRef
  useEffect(() => {
    if (!showBusy) {
      scanPosRef.current = 0;
      scanDirRef.current = 1;
      return;
    }
    const w = scanWidth;
    const timer = setInterval(() => {
      const next = scanPosRef.current + scanDirRef.current;
      if (next >= w - 1) scanDirRef.current = -1;
      else if (next <= 0) scanDirRef.current = 1;
      scanPosRef.current = next;
      try {
        if (scanRef.current) {
          scanRef.current.content = buildScanContent(scanPosRef.current, w);
        }
      } catch {}
    }, SCAN_SPEED);
    return () => clearInterval(timer);
  }, [showBusy, scanWidth]);

  // Elapsed timer — 1s interval, only touches elapsedRef
  useEffect(() => {
    if (!showBusy) {
      if (completedTimeRef.current && completedRef.current) {
        try {
          completedRef.current.content = buildCompletedContent(completedTimeRef.current);
        } catch {}
      }
      return;
    }
    let prevElapsed = -1;
    let prevQc: number | undefined;
    const timer = setInterval(() => {
      const { isLoading: ld, isCompacting: cp, queueCount: qc } = propsRef.current;
      const elapsed = cp
        ? useStatusBarStore.getState().compactElapsed
        : ld
          ? Math.floor((Date.now() - loadingStartRef.current) / 1000)
          : 0;
      if (elapsed === prevElapsed && qc === prevQc) return;
      prevElapsed = elapsed;
      prevQc = qc;
      elapsedSecRef.current = elapsed;
      try {
        if (elapsedRef.current) {
          elapsedRef.current.content = buildElapsedContent(elapsed, qc);
        }
      } catch {}
    }, 1000);
    return () => clearInterval(timer);
  }, [showBusy]);

  return (
    <box paddingX={0} flexDirection="column" flexShrink={0}>
      {showBusy && (
        <>
          <box height={1} paddingX={1}>
            <text fg={getThemeTokens().error} attributes={TextAttributes.BOLD}>
              {icon("stop")} ^X to stop
            </text>
          </box>
          <box height={1} paddingX={1}>
            <text ref={scanRef} content={buildScanContent(scanPosRef.current, scanWidth)} />
          </box>
        </>
      )}
      <box height={1} flexDirection="row">
        {showBusy ? (
          <>
            <text
              ref={ghostRef}
              content={buildGhostContent(ghostTickRef.current % 4 !== 3, isCompacting)}
            />
            <text
              ref={statusRef}
              content={buildStatusContent(isCompacting, forgeStatusRef.current)}
            />
            <text
              ref={elapsedRef}
              truncate
              content={buildElapsedContent(elapsedSecRef.current, queueCount)}
            />
          </>
        ) : completedTimeRef.current ? (
          <text
            ref={completedRef}
            truncate
            content={buildCompletedContent(completedTimeRef.current)}
          />
        ) : null}
      </box>
    </box>
  );
}
