import { useCallback, useEffect, useRef, useState } from "react";
import { setNvimInstance } from "../core/editor/instance.js";
import { getEditorDimensions } from "../core/editor/layout.js";
import {
  getBufferName,
  getCursorPosition,
  getVisualSelection,
  launchNeovim,
  type NvimInstance,
  openFile as nvimOpenFile,
  shutdownNeovim,
} from "../core/editor/neovim.js";
import { onFileEdited } from "../core/tools/file-events.js";
import type { NvimConfigMode } from "../types/index.js";

export interface UseNeovimReturn {
  ready: boolean;
  ptyWrite: (data: string) => void;
  ptyOnData: (cb: (data: Uint8Array) => void) => () => void;
  ptyResize: (cols: number, rows: number) => void;
  nvimCols: number;
  nvimRows: number;
  modeName: string;
  fileName: string | null;
  cursorLine: number;
  cursorCol: number;
  visualSelection: string | null;
  clearSelection: () => void;
  openFile: (path: string) => Promise<void>;
  sendKeys: (keys: string) => Promise<void>;
  sendMouse: (button: string, action: string, row: number, col: number) => Promise<void>;
  error: string | null;
}

const noop = () => {};
const noopUnsub = () => noop;

/** Map nvim_get_mode short codes to the full names used by mode_change redraw events. */
function mapNvimMode(raw: string): string {
  switch (raw) {
    case "n":
      return "normal";
    case "i":
      return "insert";
    case "v":
      return "visual";
    case "V":
      return "visual line";
    case "\x16":
      return "visual block"; // Ctrl-V
    case "c":
      return "cmdline_normal";
    case "R":
      return "replace";
    case "r":
      return "replace";
    case "t":
      return "terminal";
    case "s":
      return "visual"; // select mode → treat as visual
    case "S":
      return "visual line";
    default:
      return raw;
  }
}

export function useNeovim(
  active: boolean,
  nvimPath?: string,
  nvimConfig?: NvimConfigMode,
  onExit?: () => void,
  showHints = true,
  hasTabBar = true,
  splitPct = 60,
): UseNeovimReturn {
  const nvimRef = useRef<NvimInstance | null>(null);
  const mountedRef = useRef(true);
  const launchingRef = useRef(false);
  const closeHandlerRef = useRef<(() => void) | null>(null);

  const [ready, setReady] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [modeName, setModeName] = useState("normal");
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(0);
  const [visualSelection, setVisualSelection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launchGeneration, setLaunchGeneration] = useState(0);
  const [nvimDims, setNvimDims] = useState({ cols: 80, rows: 24 });

  // Stable ref for onExit so it doesn't re-trigger the launch effect
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  // PTY function refs — updated when nvim launches
  const ptyWriteRef = useRef<(data: string) => void>(noop);
  const ptyOnDataRef = useRef<(cb: (data: Uint8Array) => void) => () => void>(noopUnsub);
  const ptyResizeRef = useRef<(cols: number, rows: number) => void>(noop);

  // Launch neovim on first active=true (launchGeneration triggers re-launch after close)
  useEffect(() => {
    void launchGeneration;
    if (!active || nvimRef.current || launchingRef.current) return;

    launchingRef.current = true;

    if (!nvimPath) {
      setError("neovim-not-found");
      launchingRef.current = false;
      return;
    }

    const termCols = process.stdout.columns ?? 120;
    const termRows = process.stdout.rows ?? 40;
    const dims = getEditorDimensions(termCols, termRows, showHints, hasTabBar, splitPct);

    launchNeovim(nvimPath ?? "nvim", dims.cols, dims.rows, nvimConfig)
      .then((nvim) => {
        if (!mountedRef.current) {
          shutdownNeovim(nvim).catch(() => {});
          return;
        }
        nvimRef.current = nvim;
        setNvimInstance(nvim);

        // Expose PTY functions
        ptyWriteRef.current = nvim.pty.write;
        ptyOnDataRef.current = nvim.pty.onData;
        ptyResizeRef.current = nvim.pty.resize;
        setNvimDims({ cols: dims.cols, rows: dims.rows });

        setReady(true);
        setError(null);

        // Detect when neovim exits (user runs :q, :qa, etc.)
        const handleClose = () => {
          nvimRef.current = null;
          setNvimInstance(null);
          ptyWriteRef.current = noop;
          ptyOnDataRef.current = noopUnsub;
          ptyResizeRef.current = noop;
          if (!mountedRef.current) return;
          setReady(false);
          setLaunchGeneration((g) => g + 1);
          onExitRef.current?.();
        };
        closeHandlerRef.current = handleClose;
        nvim.pty.proc.exited.then(handleClose);
      })
      .catch((err: unknown) => {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        launchingRef.current = false;
      });
  }, [active, nvimPath, nvimConfig, showHints, hasTabBar, splitPct, launchGeneration]);

  // Resize neovim when terminal dimensions change
  useEffect(() => {
    if (!ready || !active) return;

    const onResize = () => {
      const nvim = nvimRef.current;
      if (!nvim || !mountedRef.current) return;
      const tc = process.stdout.columns ?? 120;
      const tr = process.stdout.rows ?? 40;
      const d = getEditorDimensions(tc, tr, showHints, hasTabBar, splitPct);
      nvim.pty.resize(d.cols, d.rows);
      setNvimDims({ cols: d.cols, rows: d.rows });
    };

    onResize();
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.removeListener("resize", onResize);
    };
  }, [ready, active, showHints, hasTabBar, splitPct]);

  // Poll buffer name, cursor position, and visual selection when ready
  useEffect(() => {
    if (!ready || !active) return;

    const poll = () => {
      const nvim = nvimRef.current;
      if (!nvim || !mountedRef.current) return;

      Promise.all([
        getBufferName(nvim),
        getCursorPosition(nvim),
        getVisualSelection(nvim),
        nvim.api.executeLua("return vim.api.nvim_get_mode().mode", []) as Promise<string>,
      ])
        .then(([name, cursor, selection, rawMode]) => {
          if (!mountedRef.current) return;
          if (name) setFileName((prev) => (prev === name ? prev : name));
          setCursorLine((prev) => (prev === cursor.line ? prev : cursor.line));
          setCursorCol((prev) => (prev === cursor.col ? prev : cursor.col));
          setVisualSelection((prev) => {
            if (selection) return selection;
            return prev;
          });
          if (typeof rawMode === "string") {
            const mapped = mapNvimMode(rawMode);
            setModeName((prev) => (prev === mapped ? prev : mapped));
          }
        })
        .catch(() => {});
    };

    poll();
    const interval = setInterval(poll, 500);
    return () => clearInterval(interval);
  }, [ready, active]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const nvim = nvimRef.current;
      if (nvim) {
        setNvimInstance(null);
        shutdownNeovim(nvim).catch(() => {});
        nvimRef.current = null;
      }
    };
  }, []);

  // Auto-reload buffers when AI edits files
  useEffect(() => {
    if (!ready || !active) return;
    return onFileEdited(() => {
      const nvim = nvimRef.current;
      if (nvim) nvim.api.command("checktime").catch(() => {});
    });
  }, [ready, active]);

  const openFile = useCallback(async (path: string) => {
    const nvim = nvimRef.current;
    if (!nvim || !mountedRef.current) return;
    try {
      await nvimOpenFile(nvim, path);
      if (mountedRef.current) {
        setFileName(path);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }, []);

  const sendKeys = useCallback(async (keys: string) => {
    const nvim = nvimRef.current;
    if (!nvim || !mountedRef.current) return;
    try {
      await nvim.api.input(keys);
    } catch {}
  }, []);

  const clearSelection = useCallback(() => {
    setVisualSelection(null);
  }, []);

  const sendMouse = useCallback(
    async (button: string, action: string, row: number, col: number) => {
      const nvim = nvimRef.current;
      if (!nvim || !mountedRef.current) return;
      try {
        await nvim.api.request("nvim_input_mouse", [button, action, "", 0, row, col]);
      } catch {}
    },
    [],
  );

  return {
    ready,
    ptyWrite: ptyWriteRef.current,
    ptyOnData: ptyOnDataRef.current,
    ptyResize: ptyResizeRef.current,
    nvimCols: nvimDims.cols,
    nvimRows: nvimDims.rows,
    modeName,
    fileName,
    cursorLine,
    cursorCol,
    visualSelection,
    clearSelection,
    openFile,
    sendKeys,
    sendMouse,
    error,
  };
}
