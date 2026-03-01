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

## Conventions

- Use `bun` instead of `node`, `npm`, `npx`
- Use Biome for linting + formatting (not ESLint/Prettier)
- Strict TypeScript — no `any`, no unused vars
- React JSX transform (no `import React` needed)
