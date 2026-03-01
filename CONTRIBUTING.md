# Contributing to SoulForge

Thanks for wanting to contribute to SoulForge! This doc covers everything you need to know before opening a PR.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Dev Setup](#dev-setup)
- [Project Structure](#project-structure)
- [Code Conventions](#code-conventions)
- [Architecture Notes](#architecture-notes)
- [Submitting a PR](#submitting-a-pr)

---

## Project Overview

SoulForge is an AI-powered terminal IDE built with Bun, TypeScript, Ink (React for CLIs), and the Vercel AI SDK. It embeds a real Neovim instance inside the TUI, runs a multi-agent tool loop, and supports multiple LLM providers. The AI persona is called **Forge** — not "AI" or "assistant".

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript (strict) |
| TUI Framework | [Ink](https://github.com/vadimdemedes/ink) — React for CLIs |
| LLM Integration | [Vercel AI SDK v6](https://sdk.vercel.ai/) |
| LLM Providers | Anthropic, OpenAI, xAI, Google |
| Editor | Neovim via msgpack-RPC |
| Schema Validation | Zod |
| Linter / Formatter | [Biome](https://biomejs.dev/) |

---

## Dev Setup

### Prerequisites

- **Bun** ≥ 1.0 — [bun.sh](https://bun.sh)
- **Neovim** ≥ 0.9.0 — required at runtime
- At least one LLM API key (see below)

### Install & Run

```bash
git clone https://github.com/proxysoul/soulforge
cd soulforge
bun install
bun run dev
```

### API Keys

Set at least one of these in your environment:

```bash
export ANTHROPIC_API_KEY=sk-...
export OPENAI_API_KEY=sk-...
export XAI_API_KEY=...
export GOOGLE_GENERATIVE_AI_API_KEY=...

# Or use a single Vercel AI Gateway key instead of all the above
export AI_GATEWAY_API_KEY=...
```

### Scripts

```bash
bun run dev          # Start SoulForge
bun run build        # Bundle to dist/ (target: bun)
bun run lint         # Biome check
bun run lint:fix     # Biome auto-fix
bun run format       # Biome format
bun run typecheck    # tsc --noEmit
```

---

## Project Structure

```
src/
├── index.tsx              # Entry point
├── types/index.ts         # Shared TypeScript types
├── config/index.ts        # Config load/save (~/.proxy/config.json)
├── components/            # Ink (React) UI components
│   ├── App.tsx            # Root component — main orchestrator
│   ├── EditorPanel.tsx    # Neovim display panel
│   ├── InputBox.tsx       # Chat input + slash command autocomplete
│   ├── MessageList.tsx    # Chat history
│   ├── StreamingText.tsx  # Live streaming text with cursor
│   ├── ToolCallDisplay.tsx# Tool call progress UI
│   ├── LlmSelector.tsx    # Ctrl+L model picker popup
│   ├── SkillSearch.tsx    # Ctrl+S skills browser popup
│   ├── Markdown.tsx       # Custom inline markdown renderer
│   ├── Footer.tsx         # Keybinding legend
│   ├── StatusBar.tsx      # Provider / model / cwd bar
│   └── Banner.tsx         # Animated ASCII banner
├── core/
│   ├── agents/            # Forge + subagent definitions
│   ├── context/           # System prompt builder
│   ├── editor/            # Neovim launch, screen, input
│   ├── llm/               # Provider resolution + model fetching
│   ├── skills/            # Skill discovery, install, load
│   └── tools/             # Tool definitions (read, edit, shell, grep, glob)
└── hooks/                 # React hooks (editor focus, input, neovim, models)
```

---

## Code Conventions

These are strict. Please follow them or your PR will be asked to change before merge.

### General

- **Always use `bun`** — never `node`, `npm`, or `npx` in scripts or docs
- **No `any`** — TypeScript strict mode is enforced; use proper types or Zod inference
- **No unused variables** — tsc will catch these
- **No `import React`** in `.tsx` files — JSX transform handles it automatically

### Linting & Formatting

We use **Biome**, not ESLint or Prettier. Run before every commit:

```bash
bun run lint:fix
bun run format
bun run typecheck
```

### LLM / AI SDK

- Model IDs must always use the `"provider/model"` format — e.g. `"anthropic/claude-sonnet-4"`
- When defining tools, use `inputSchema` (Zod) **not** `parameters` — this is the Vercel AI SDK v6 API
- `createForgeAgent()` is a **factory, not a singleton** — a new agent is created per chat turn so the model can be swapped mid-session

### Config & Paths

- Config is stored at `~/.proxy/config.json` — use `loadConfig()` / `saveConfig()` from `src/config/index.ts`
- Skill files are named `SKILL.md`
- Skill search hits `https://skills.sh/api/search`

### Persona

- The AI is named **Forge** — never "AI", "assistant", or "bot" in UI strings, prompts, or docs

---

## Architecture Notes

### Agent System

SoulForge uses a **multi-agent loop** via the Vercel AI SDK:

- **Forge** (main agent) — up to 10 steps per turn, has access to 5 direct tools (`read_file`, `edit_file`, `shell`, `grep`, `glob`) plus 2 subagent tools
- **Explore subagent** — read-only (`read_file`, `grep`, `glob`), up to 15 steps, used for codebase research
- **Code subagent** — full tool access, up to 20 steps, used for implementing changes

Each subagent gets a **fresh context window** per invocation. Subagents are exposed to Forge as regular tool calls via `buildSubagentTools()`.

### Neovim Integration

Neovim is spawned with `--embed -i NONE` and communicates over msgpack-RPC pipes. `NvimScreen` processes `redraw` events (`grid_line`, `hl_attr_define`, `flush`, etc.) into `ScreenSegment[][]` that Ink renders. Raw stdin bytes are intercepted when the editor is focused and translated to Neovim key notation before being forwarded via `nvim.api.input()`.

### LLM Providers

Provider resolution lives in `src/core/llm/provider.ts`. If `AI_GATEWAY_API_KEY` is set, all providers are routed through the Vercel AI Gateway. Otherwise direct provider SDKs are used. Model lists are fetched live from each provider's API and cached in memory, with hardcoded fallbacks if the API call fails.

---

## Submitting a PR

1. Fork the repo and create a branch off `main`
2. Make your changes following the conventions above
3. Run `bun run lint:fix && bun run format && bun run typecheck` — fix any issues
4. Open a PR with a clear description of what changed and why
5. Keep PRs focused — one feature or fix per PR

If you're unsure whether something is in scope, open an issue first.
