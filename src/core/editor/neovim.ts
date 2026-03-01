import { type ChildProcess, spawn } from "node:child_process";
import { attach } from "neovim";
import { NvimScreen } from "./screen.js";

export interface NvimInstance {
  api: ReturnType<typeof attach>;
  process: ChildProcess;
  screen: NvimScreen;
}

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

/**
 * Launch an embedded neovim instance with UI attached.
 * We attach as a UI client and receive redraw events to render
 * the screen in our TUI.
 *
 * Flags:
 * - `--embed`: run as an embedded UI client (waits for nvim_ui_attach)
 * - `-i NONE`: skip ShaDa file (marks, registers, history — irrelevant for embedded use)
 */
export async function launchNeovim(
  nvimPath: string,
  cols: number = DEFAULT_COLS,
  rows: number = DEFAULT_ROWS,
): Promise<NvimInstance> {
  const proc = spawn(nvimPath, ["--embed", "-i", "NONE"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const api = attach({ proc });
  const screen = new NvimScreen(rows, cols);

  // Subscribe to notifications BEFORE ui_attach so we don't miss events
  api.on("notification", (method: string, args: unknown[]) => {
    if (method === "redraw") {
      screen.processEvents(args);
    }
  });

  // Attach as a UI client — neovim will start sending redraw events
  await api.request("nvim_ui_attach", [cols, rows, { ext_linegrid: true, rgb: true }]);

  return { api, process: proc, screen };
}

/**
 * Open a file in the embedded neovim instance.
 */
export async function openFile(nvim: NvimInstance, filePath: string): Promise<void> {
  await nvim.api.command(`edit ${filePath}`);
}

/**
 * Get current buffer content from neovim.
 */
export async function getBufferContent(nvim: NvimInstance): Promise<string[]> {
  const buffer = await nvim.api.buffer;
  return buffer.getLines({ start: 0, end: -1, strictIndexing: false });
}

/**
 * Apply an edit to the current buffer in neovim.
 */
export async function applyEdit(
  nvim: NvimInstance,
  startLine: number,
  endLine: number,
  replacement: string[],
): Promise<void> {
  const buffer = await nvim.api.buffer;
  await buffer.setLines(replacement, {
    start: startLine,
    end: endLine,
    strictIndexing: false,
  });
}

/**
 * Get cursor position from neovim.
 */
export async function getCursorPosition(
  nvim: NvimInstance,
): Promise<{ line: number; col: number }> {
  const window = await nvim.api.window;
  const [line, col] = await window.cursor;
  return { line, col };
}

/**
 * Get current buffer name from neovim.
 */
export async function getBufferName(nvim: NvimInstance): Promise<string> {
  const result = await nvim.api.request("nvim_buf_get_name", [0]);
  return typeof result === "string" ? result : "";
}

/**
 * Shut down the embedded neovim instance.
 */
export async function shutdownNeovim(nvim: NvimInstance): Promise<void> {
  try {
    await nvim.api.request("nvim_ui_detach", []);
  } catch {
    // May not have UI attached
  }
  try {
    await nvim.api.command("qall!");
  } catch {
    // May already be closed
  }
  nvim.process.kill();
}
