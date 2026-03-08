import { fg as fgStyle, StyledText, type TextChunk, type TextRenderable } from "@opentui/core";
import { useEffect, useRef } from "react";
import { icon } from "../core/icons.js";
import { useRepoMapStore } from "../stores/repomap.js";
import { SPINNER_FRAMES } from "./shared.js";

function buildContent(
  status: string,
  files: number,
  symbols: number,
  progress: string,
  spinnerIdx: number,
  semStatus: string,
  semProgress: string,
): StyledText {
  const frame = SPINNER_FRAMES[spinnerIdx % SPINNER_FRAMES.length] ?? "⠋";

  if (status === "scanning") {
    const label = progress ? ` ${frame} ${progress}` : ` ${frame}`;
    return new StyledText([fgStyle("#555")(icon("code")), fgStyle("#FF8C00")(label)]);
  }

  const parts: TextChunk[] = [];
  if (status === "ready") {
    parts.push(
      fgStyle("#555")(icon("code")),
      fgStyle("#2d5")(` ${String(files)}f ${String(symbols)}s`),
    );
  } else if (status === "error") {
    parts.push(fgStyle("#555")(icon("code")), fgStyle("#FF0040")(" err"));
  } else {
    parts.push(fgStyle("#555")(icon("code")), fgStyle("#444")(" off"));
  }

  if (semStatus === "generating") {
    const label = semProgress ? ` ${frame} ${semProgress}` : ` ${frame} sem`;
    parts.push(fgStyle("#FF8C00")(label));
  } else if (semStatus === "ready") {
    const mode = semProgress.startsWith("ast") ? "ast" : "sem";
    parts.push(fgStyle("#555")(` ${mode} `), fgStyle("#2d5")("✓"));
  }

  return new StyledText(parts);
}

export function RepoMapIndicator() {
  const textRef = useRef<TextRenderable>(null);
  const spinnerRef = useRef(0);

  const stateRef = useRef({
    status: useRepoMapStore.getState().status,
    files: useRepoMapStore.getState().files,
    symbols: useRepoMapStore.getState().symbols,
    scanProgress: useRepoMapStore.getState().scanProgress,
    semStatus: useRepoMapStore.getState().semanticStatus,
    semProgress: useRepoMapStore.getState().semanticProgress,
  });

  useEffect(
    () =>
      useRepoMapStore.subscribe((s) => {
        stateRef.current = {
          status: s.status,
          files: s.files,
          symbols: s.symbols,
          scanProgress: s.scanProgress,
          semStatus: s.semanticStatus,
          semProgress: s.semanticProgress,
        };
      }),
    [],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const { status, files, symbols, scanProgress, semStatus, semProgress } = stateRef.current;
      if (status === "scanning" || semStatus === "generating") spinnerRef.current++;
      try {
        if (textRef.current)
          textRef.current.content = buildContent(
            status,
            files,
            symbols,
            scanProgress,
            spinnerRef.current,
            semStatus,
            semProgress,
          );
      } catch {}
    }, 80);
    return () => clearInterval(timer);
  }, []);

  const { status, files, symbols, scanProgress, semStatus, semProgress } = stateRef.current;
  return (
    <text
      ref={textRef}
      truncate
      content={buildContent(status, files, symbols, scanProgress, 0, semStatus, semProgress)}
    />
  );
}
