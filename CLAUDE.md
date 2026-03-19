# SoulForge

AI-Powered Terminal IDE by proxySoul.

## Stack

- **Runtime**: Bun (not Node.js)
- **Language**: TypeScript (strict mode)
- **TUI**: Ink (React for CLIs)
- **LLM**: Vercel AI SDK (multi-provider)
- **Editor**: Neovim (embedded via msgpack-RPC)
- **Linter/Formatter**: Biome

## Commands

- `bun run dev` — start soulforge
- `bun run lint` — lint with biome
- `bun run lint:fix` — auto-fix lint issues
- `bun run format` — format with biome
- `bun run typecheck` — check types

## CLI Flags

- `--session <id>` / `--resume <id>` / `-s <id>` — resume a saved session
- `--headless <prompt>` — run without TUI, stream output to stdout
- `--headless --json` — structured JSON after completion
- `--headless --events` — JSONL event stream (real-time tool calls, text, steps)
- `--headless --model <provider/model>` — override model
- `--headless --mode <mode>` — set mode (default/architect/plan/auto)
- `--headless --max-steps <n>` — limit agent steps
- `--headless --timeout <ms>` — abort after timeout
- `--headless --quiet` / `-q` — suppress header/footer
- `--headless --cwd <dir>` — set working directory
- `--list-providers` — show providers and their key status
- `--list-models [provider]` — show available models
- `--set-key <provider> <key>` — save an API key to system keychain
- Piped input: `echo "prompt" | soulforge --headless`
- Custom providers: add `providers` array to config (OpenAI-compatible APIs)
- Project instructions: `SOULFORGE.md` loaded by default, `CLAUDE.md` + 9 others via `/instructions`

## Conventions

- Use `bun` instead of `node`, `npm`, `npx`
- Use Biome for linting + formatting (not ESLint/Prettier)
- Strict TypeScript — no `any`, no unused vars
- React JSX transform (no `import React` needed)
