#!/usr/bin/env bun

import { BRAND_SEGMENTS, garble, WISP_FRAMES, WORDMARK } from "./components/splash.js";
import { logBackgroundError } from "./stores/errors.js";

// ─── ANSI ───

const RST = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";

function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `\x1b[38;2;${(n >> 16) & 0xff};${(n >> 8) & 0xff};${n & 0xff}m`;
}

const PURPLE = rgb("#9B30FF");
const DIM_PURPLE = rgb("#4a1a6b");
const FAINT = rgb("#333333");
const MUTED = rgb("#555555");
const SUBTLE = rgb("#444444");
const RED = rgb("#FF0040");

const cols = process.stdout.columns ?? 80;
const rows = process.stdout.rows ?? 24;

const GHOST = "󰊠";

// ─── Layout ───

const LAYOUT_H = 14;
const base = Math.max(1, Math.floor((rows - LAYOUT_H) / 2));

const ROW = {
  ghost: base,
  wisp: base + 1,
  word: base + 3,
  sub: base + 6,
  brand: base + 8,
  div: base + 10,
  status: base + 12,
};

// ─── Helpers ───

const at = (r: number, c: number) => `\x1b[${r};${c}H`;

function center(row: number, text: string, style = ""): void {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape sequences
  const plain = text.replace(/\x1b\[[^m]*m/g, "");
  const c = Math.max(1, Math.floor((cols - plain.length) / 2) + 1);
  process.stdout.write(`${at(row, c)}${style}${text}${RST}`);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const bootStart = performance.now();

function status(msg: string): void {
  const elapsed = ((performance.now() - bootStart) / 1000).toFixed(1);
  const full = `${msg}  ${DIM}${elapsed}s${RST}`;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI
  const plain = full.replace(/\x1b\[[^m]*m/g, "");
  const c = Math.max(1, Math.floor((cols - plain.length) / 2) + 1);
  process.stdout.write(
    `${at(ROW.status, 1)}\x1b[2K${at(ROW.status, c)}${MUTED}${msg}  ${DIM}${elapsed}s${RST}`,
  );
}

// ─── Hide cursor, clear screen ───

process.stdout.write("\x1b[?25l\x1b[2J\x1b[H");

// ─── Kick off module loading immediately (runs during animation) ───

const earlyModules = Promise.all([
  import("./config/index.js"),
  import("./core/editor/detect.js"),
  import("./core/icons.js"),
  import("./core/setup/install.js"),
]);

// ─── Phase 1: Ghost materializes ───

for (const frame of ["░", "▒", "▓", GHOST]) {
  center(ROW.ghost, frame, PURPLE + BOLD);
  await sleep(50);
}

// ─── Phase 2: Wisp + animate ───

center(ROW.wisp, WISP_FRAMES[0] ?? "", DIM + DIM_PURPLE);
let wispTick = 0;
const wispTimer = setInterval(() => {
  wispTick++;
  center(ROW.wisp, WISP_FRAMES[wispTick % WISP_FRAMES.length] ?? "", DIM + DIM_PURPLE);
}, 500);

// ─── Phase 3: Wordmark glitch reveal ───

const narrow = cols < 40;
await sleep(100);

if (narrow) {
  center(ROW.word + 1, "SOULFORGE", PURPLE + BOLD);
} else {
  for (let i = 0; i < 3; i++) {
    center(ROW.word + i, garble(WORDMARK[i] ?? ""), FAINT);
    await sleep(40);
    center(ROW.word + i, WORDMARK[i] ?? "", PURPLE + BOLD);
    await sleep(30);
  }
}

// ─── Phase 4: Subtitle ───

await sleep(60);
center(
  ROW.sub,
  `${SUBTLE}── ${RST}${MUTED}${ITALIC}AI-Powered Terminal IDE${RST}${SUBTLE} ──${RST}`,
);

// ─── Phase 5: "by ProxySoul.com" typewriter ───

await sleep(100);
const brandParts = BRAND_SEGMENTS.map((s) => ({ text: s.text, color: rgb(s.color) }));
const brandPlain = BRAND_SEGMENTS.map((s) => s.text).join("");
const brandCol = Math.max(1, Math.floor((cols - brandPlain.length) / 2) + 1);
let charIdx = 0;
for (const part of brandParts) {
  for (let _c = 0; _c < part.text.length; _c++) {
    charIdx++;
    let out = `${at(ROW.brand, brandCol)}`;
    let pos = 0;
    for (const p of brandParts) {
      const visible = p.text.slice(0, Math.max(0, charIdx - pos));
      out += `${p.color}${visible}`;
      pos += p.text.length;
    }
    out += `${RED}${charIdx < brandPlain.length ? "█" : ""}${RST}  `;
    process.stdout.write(out);
    await sleep(25);
  }
}
let brandFinal = `${at(ROW.brand, brandCol)}`;
for (const p of brandParts) brandFinal += `${p.color}${p.text}`;
brandFinal += `${RST}  `;
process.stdout.write(brandFinal);

// ─── Phase 6: Divider sweep from center ───

await sleep(60);
const divW = Math.min(40, cols - 10);
for (let w = 2; w <= divW; w += 3) {
  const dc = Math.max(1, Math.floor((cols - w) / 2) + 1);
  process.stdout.write(`${at(ROW.div, dc)}${FAINT}${"─".repeat(w)}${RST}`);
  await sleep(8);
}
const divCol = Math.max(1, Math.floor((cols - divW) / 2) + 1);
process.stdout.write(`${at(ROW.div, divCol)}${FAINT}${"─".repeat(divW)}${RST}`);

// ─── Real loading (modules should be ready from earlyModules) ───

status("loading modules…");
const [configMod, detectMod, iconsMod, installMod] = await earlyModules;

const { loadConfig, loadProjectConfig } = configMod;
const { detectNeovim } = detectMod;
const { initNerdFont } = iconsMod;
const { getVendoredPath, installNeovim, installRipgrep } = installMod;

let resumeSessionId: string | undefined;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--session" || arg === "--resume" || arg === "-s") {
    resumeSessionId = args[i + 1];
    i++;
  } else if (arg?.startsWith("--session=")) {
    resumeSessionId = arg.slice("--session=".length);
  } else if (arg?.startsWith("--resume=")) {
    resumeSessionId = arg.slice("--resume=".length);
  }
}

status("loading config…");
const config = loadConfig();
const projectConfig = loadProjectConfig(process.cwd());
initNerdFont(config.nerdFont);

status("detecting neovim…");
let nvim = detectNeovim();
if (!nvim) {
  status("installing neovim…");
  try {
    const path = await installNeovim();
    nvim = { path, version: "0.11.1" };
  } catch {
    // Continue without neovim — editor panel will show install instructions
  }
}
if (nvim) {
  config.nvimPath = nvim.path;
}

if (!getVendoredPath("rg")) {
  status("installing ripgrep…");
  installRipgrep().catch((err) => {
    logBackgroundError(
      "boot",
      `ripgrep install failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}

status("checking providers…");
const { checkProviders } = await import("./core/llm/provider.js");
const { checkPrerequisites } = await import("./core/setup/prerequisites.js");
const [bootProviders, bootPrereqs] = await Promise.all([
  checkProviders(),
  Promise.resolve(checkPrerequisites()),
]);

status("warming up intelligence…");
import("./core/intelligence/index.js")
  .then(({ warmupIntelligence }) => warmupIntelligence(process.cwd(), config.codeIntelligence))
  .catch((err) => {
    logBackgroundError(
      "boot",
      `intelligence warmup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

status("loading UI framework…");
const { createCliRenderer } = await import("@opentui/core");
const { createRoot } = await import("@opentui/react");

status("loading app…");
const { App } = await import("./components/App.js");
const { start } = await import("./index.js");

clearInterval(wispTimer);
process.stdout.write("\x1b[?25h\x1b[2J\x1b[H");

await start({
  App,
  createCliRenderer,
  createRoot,
  config,
  projectConfig,
  resumeSessionId,
  bootProviders,
  bootPrereqs,
});
