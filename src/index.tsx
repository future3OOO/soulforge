#!/usr/bin/env bun
import { render } from "ink";
import { App } from "./components/App.js";
import { loadConfig } from "./config/index.js";
import { detectNeovim } from "./core/editor/detect.js";

// Load configuration
const config = loadConfig();

// Detect neovim before launching UI
try {
  const nvim = detectNeovim();
  config.nvimPath = nvim.path;
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\x1b[1;31mError:\x1b[0m ${msg}\n`);
  process.exit(1);
}

// Clear terminal on exit
process.on("exit", () => {
  process.stdout.write("\x1b[2J\x1b[H");
});

// Clear screen and render
process.stdout.write("\x1b[2J\x1b[H");

render(<App config={config} />, {
  exitOnCtrlC: false,
});
