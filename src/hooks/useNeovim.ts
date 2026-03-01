import { useCallback, useEffect, useRef, useState } from "react";
import {
  getBufferName,
  launchNeovim,
  type NvimInstance,
  openFile as nvimOpenFile,
  shutdownNeovim,
} from "../core/editor/neovim.js";
import type { ScreenSegment } from "../core/editor/screen.js";

export interface UseNeovimReturn {
  ready: boolean;
  screenLines: ScreenSegment[][];
  defaultBg: string | undefined;
  modeName: string;
  fileName: string | null;
  openFile: (path: string) => Promise<void>;
  sendKeys: (keys: string) => Promise<void>;
  error: string | null;
}

export function useNeovim(active: boolean, nvimPath?: string): UseNeovimReturn {
  const nvimRef = useRef<NvimInstance | null>(null);
  const mountedRef = useRef(true);
  const launchingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [screenLines, setScreenLines] = useState<ScreenSegment[][]>([]);
  const [defaultBg, setDefaultBg] = useState<string | undefined>("#1a1a2e");
  const [modeName, setModeName] = useState("normal");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Launch neovim on first active=true
  useEffect(() => {
    if (!active || nvimRef.current || launchingRef.current) return;

    launchingRef.current = true;

    // Compute dimensions to match the actual editor panel:
    // Panel is 60% width with round border (2 chars horizontal, 2 rows vertical)
    // Vertical: app header(1) + app footer(1) + border(2) + title(1) + sep(1) + sep(1) + bottom bar(1) = 8
    const termCols = process.stdout.columns ?? 120;
    const termRows = process.stdout.rows ?? 40;
    const panelCols = Math.max(20, Math.floor(termCols * 0.6) - 2);
    const panelRows = Math.max(6, termRows - 8);

    launchNeovim(nvimPath ?? "nvim", panelCols, panelRows)
      .then((nvim) => {
        if (!mountedRef.current) {
          shutdownNeovim(nvim).catch(() => {});
          return;
        }
        nvimRef.current = nvim;

        // Event-driven screen updates: fire on neovim flush instead of polling
        nvim.screen.onFlush = () => {
          if (!mountedRef.current) return;
          const { screen } = nvim;
          if (screen.dirty) {
            screen.dirty = false;
            setScreenLines(screen.getSegmentedLines());
            setDefaultBg(screen.getDefaultBg());
            setModeName(screen.modeName);
          }
        };

        // Flush any initial events that arrived before onFlush was set
        // (nvim_ui_attach triggers redraw events during the async handshake)
        if (nvim.screen.dirty) {
          nvim.screen.dirty = false;
          setScreenLines(nvim.screen.getSegmentedLines());
          setDefaultBg(nvim.screen.getDefaultBg());
          setModeName(nvim.screen.modeName);
        }

        setReady(true);
        setError(null);
      })
      .catch((err: unknown) => {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        launchingRef.current = false;
      });
  }, [active, nvimPath]);

  // Poll buffer name at a low frequency (~2s) when ready
  useEffect(() => {
    if (!ready || !active) return;

    const interval = setInterval(() => {
      const nvim = nvimRef.current;
      if (!nvim || !mountedRef.current) return;

      getBufferName(nvim)
        .then((name) => {
          if (mountedRef.current && name) {
            setFileName(name);
          }
        })
        .catch(() => {});
    }, 2000);

    return () => clearInterval(interval);
  }, [ready, active]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const nvim = nvimRef.current;
      if (nvim) {
        nvim.screen.onFlush = null;
        shutdownNeovim(nvim).catch(() => {});
        nvimRef.current = null;
      }
    };
  }, []);

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
    } catch {
      // Fire-and-forget — ignore errors
    }
  }, []);

  return { ready, screenLines, defaultBg, modeName, fileName, openFile, sendKeys, error };
}
