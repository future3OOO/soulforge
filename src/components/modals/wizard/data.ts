/* ── Step definitions ──────────────────────────────────────────── */

export const STEPS = [
  "welcome",
  "setup",
  "intelligence",
  "workflow",
  "shortcuts",
  "theme",
  "ready",
] as const;
export type Step = (typeof STEPS)[number];

export const STEP_LABELS: Record<Step, string> = {
  welcome: "Welcome",
  setup: "Provider & Key",
  intelligence: "Intelligence",
  workflow: "Workflow",
  shortcuts: "Shortcuts",
  theme: "Theme",
  ready: "Ready",
};

/* ── Shortcut data ────────────────────────────────────────────── */

export const SHORTCUTS = [
  {
    section: "Most Used",
    items: [
      { keys: "Ctrl+K", desc: "Command palette — search all commands", slash: false },
      { keys: "Ctrl+L", desc: "Switch model", slash: false },
      { keys: "Ctrl+E", desc: "Toggle editor panel", slash: false },
      { keys: "Ctrl+T", desc: "New tab", slash: false },
      { keys: "Ctrl+W", desc: "Close tab", slash: false },
      { keys: "Ctrl+G", desc: "Git menu", slash: false },
      { keys: "Ctrl+S", desc: "Skills browser", slash: false },
      { keys: "Ctrl+D", desc: "Cycle mode", slash: false },
      { keys: "Ctrl+C", desc: "Cancel generation", slash: false },
    ],
  },
  {
    section: "Quick Commands",
    items: [
      { keys: "/help", desc: "All commands & shortcuts", slash: true },
      { keys: "/setup", desc: "Install tools, LSP servers, fonts", slash: true },
      { keys: "/settings", desc: "Settings hub — all options in one place", slash: true },
      { keys: "/keys", desc: "Manage API keys", slash: true },
    ],
  },
] as const;

/* ── Intelligence step data ───────────────────────────────────── */

export const INTELLIGENCE_ITEMS = [
  {
    ic: "repomap",
    title: "Soul Map",
    cmd: "/repo-map",
    desc: "Live AST index of your entire codebase — files, symbols, signatures, dependencies",
    bullets: [
      "Tree-sitter parses every file → exports, types, functions with line numbers",
      "PageRank ranks files by importance — AI sees the most relevant code first",
      "Summaries: [AST] structure · [AST+SYN] + synthetic · [AST+LLM] + AI-generated",
    ],
  },
  {
    ic: "editor",
    title: "Editor & LSP",
    cmd: "Ctrl+E",
    desc: "Built-in Neovim with full language intelligence",
    bullets: [
      "Diagnostics, hover, go-to-definition, references, rename — all in-terminal",
      "Tree-sitter + LSP work together to power the Soul Map and agent tools",
    ],
  },
  {
    ic: "tools",
    title: "Agent Tools",
    cmd: "/tools",
    desc: "Toggle which tools the AI can use — fine-tune what it's allowed to do",
    bullets: [
      "File editing, shell, grep, LSP navigation, web search, and more",
      "Disable tools to restrict the agent (e.g. no shell in review mode)",
    ],
  },
  {
    ic: "skills",
    title: "Skills",
    cmd: "/skills",
    desc: "Community plugins that give the AI domain expertise",
    bullets: [
      "Search & install from skills.sh — React, testing, SEO, and more",
      "Skills inject context so the AI follows best practices for your stack",
    ],
  },
  {
    ic: "cog",
    title: "Modes",
    cmd: "/mode",
    desc: "Switch how the AI approaches tasks",
    bullets: [
      "auto (default) · architect · plan · socratic · challenge",
      "Cycle quickly with Ctrl+D or pick with /mode",
    ],
  },
] as const;

/* ── Workflow step data ───────────────────────────────────────── */

export const WORKFLOW_ITEMS = [
  {
    ic: "router",
    title: "Task Router",
    cmd: "/router",
    desc: "Assign different models to different tasks — code, explore, review, compact",
    bullets: [
      "Route coding to a strong model, exploration to a fast one",
      "Each tab has its own model — switch with Ctrl+L",
    ],
  },
  {
    ic: "tabs",
    title: "Tabs & Sessions",
    cmd: "/tab",
    desc: "Each tab is an independent chat with its own model and context",
    bullets: ["/tab new · /tab close · /tab rename", "Ctrl+P browse & restore past sessions"],
  },
  {
    ic: "git",
    title: "Git",
    cmd: "/git",
    desc: "Full git workflow from chat — AI adds co-author tag to commits",
    bullets: ["/git commit · /git diff · /git branch · /git stash — or Ctrl+G for the menu"],
  },
  {
    ic: "memory",
    title: "Memory",
    cmd: "/memory",
    desc: "Persistent knowledge the AI remembers across sessions",
    bullets: ["Project-scoped or global — Forge learns your preferences over time"],
  },
  {
    ic: "system",
    title: "Tuning",
    cmd: "/provider-settings",
    desc: "Fine-tune the AI's behavior and output quality",
    bullets: [
      "/provider-settings — thinking budget, effort, speed, context window",
      "/agent-features — de-sloppify, tier routing, auto-compact, auto-verify",
    ],
  },
] as const;

/* ── Welcome & ready content ──────────────────────────────────── */

export const WELCOME_BULLETS = [
  "Chat with AI to build, debug, and refactor code",
  "Edit files directly — AI reads and writes your codebase",
  "Run shell commands, git operations, and tests from chat",
  "Dispatch parallel agents for large multi-file tasks",
  "Built-in Neovim editor with LSP intelligence",
] as const;

export const QUICK_START = [
  '"fix the bug in auth.ts"',
  '"add tests for the user service"',
  '"refactor this to use async/await"',
  '"explain how the payment flow works"',
] as const;

/* ── Animation constants ──────────────────────────────────────── */

export const WELCOME_TITLE = "Welcome to SoulForge";
export const TYPEWRITER_MS = 45;
export const BLINK_COUNT = 4;
export const BLINK_MS = 300;
export const BLINK_INITIAL_MS = 400;

/* ── Layout constants ─────────────────────────────────────────── */

export const MAX_W = 100;
