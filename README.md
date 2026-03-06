# SoulForge

AI-powered terminal IDE by [proxySoul](https://github.com/proxysoul). Built on Bun, React (OpenTUI), Neovim, and the Vercel AI SDK.

SoulForge combines a multi-agent system, deep code intelligence, and an embedded Neovim editor into a single terminal interface. It understands your codebase structurally — not just as flat files — and uses that understanding to make AI-assisted development faster, cheaper, and more accurate.

## What Makes It Different

### Multi-Backend Code Intelligence

A tiered router tries the best available backend for every code operation, with automatic fallback:

| Tier | Backend | Capabilities |
|------|---------|-------------|
| 1 | **LSP** | definitions, references, workspace rename, diagnostics, code actions, call hierarchy, type info, formatting |
| 2 | **ts-morph** | TypeScript/JavaScript — AST-level definitions, references, rename, extract function/variable, unused detection, type info |
| 2 | **tree-sitter** | 20+ languages — symbol extraction, imports/exports, scopes, outlines via WASM grammars |
| 3 | **regex** | Universal fallback — symbol search, simple definitions, import patterns |

For each operation the router tries backends in tier order. If tier 1 returns null or throws, tier 2 is tried, then tier 3. The result: code intelligence works everywhere — full LSP when a server is running, graceful degradation otherwise.

**Supported LSP servers** (auto-discovered via PATH or Mason):

| Language | Server |
|----------|--------|
| TypeScript / JavaScript | `typescript-language-server` |
| Python | `pyright-langserver`, `pylsp` |
| Go | `gopls` |
| Rust | `rust-analyzer` |

**Post-edit diagnostics** snapshot LSP errors before an edit, diff after, and report only *new* errors — catching regressions the model would otherwise miss.

### Repo Map with PageRank

SoulForge builds a live graph of your codebase on startup. Every file and exported symbol becomes a node; import/reference edges connect them. PageRank scores surface the most structurally important files in the system prompt — the AI sees your codebase's shape, not a flat file listing.

The ranking adapts in real time:

- **Personalized PageRank** — files you've edited or read get boosted via a personalization vector, shifting the entire ranking toward your working context
- **Dynamic token budget** — repo map shrinks as conversation grows (4000 tokens early → 1500 tokens late), reclaiming space for actual work
- **FTS on symbol names** — conversation terms are matched against a full-text index of all symbols, promoting files the user is likely talking about
- **Neighbor boosting** — files connected to your context files via import edges get a post-hoc score bump
- **Blast radius tags** — each file shows `[R:N]` indicating how many files depend on it

### LLM Semantic Summaries

Top symbols (ranked by PageRank) are batched to a fast model to generate one-line descriptions of what each symbol does. These appear inline in the repo map:

```
src/core/agents/agent-bus.ts [R:12]
  +AgentBus — Shared coordination bus for parallel subagent communication
  +acquireFileRead — Lock-free file read with cache and waiter pattern
  +SharedCache — Pre-seeded cache for warm agent starts
```

Summaries are cached in SQLite keyed by `(symbol_id, file_mtime)` — editing a file automatically invalidates its summaries. The summary model is configurable via the task router (defaults to the cheapest available model).

This gives the AI a semantic understanding of the codebase's vocabulary, not just its structure.

### Git Co-Change Analysis

SoulForge parses `git log --name-only` (last 300 commits) and builds a co-change matrix of files that historically appear in the same commit. Mega-commits (>20 files) are filtered as noise.

Co-change data feeds into ranking at two levels:
1. **PageRank personalization** — co-change partners of your active files get a proportional boost in the restart vector, shifting the entire graph ranking
2. **Post-hoc scoring** — additive score bump in the final ranking, capturing implicit coupling the import graph misses (e.g., a migration and its model, a component and its test)

This means when you edit `auth.ts`, SoulForge automatically surfaces `auth.test.ts` and `middleware.ts` — files that always change together — even if there's no import between them.

### Web Search with Agent Loop

SoulForge's web search is a multi-tier system, not a single API call:

**Search backends** (with automatic fallback):
1. **Brave Search API** — structured results with snippets (`BRAVE_API_KEY`)
2. **DuckDuckGo HTML scraping** — no API key needed, zero-config fallback

**Page fetching** (for reading full articles/docs):
1. **Jina Reader** — `r.jina.ai` returns clean markdown from any URL (`JINA_API_KEY` optional)
2. **Direct fetch + Readability** — `@mozilla/readability` + `linkedom` extracts article content from raw HTML
3. **Fallback strip** — regex-based HTML→text when Readability can't parse

**Agent mode**: When a web search model is configured (via task router), `web_search` spawns a dedicated `ToolLoopAgent` that can run multiple queries, follow links with `fetch_page`, refine searches, and synthesize a structured summary — all within a single tool call. Up to 15 steps, 120s timeout.

Results are cached (5 min TTL) at both the search and page level.

### Compound Tools

Most AI coding tools make the LLM construct shell commands. The LLM guesses wrong, retries, wastes tokens. SoulForge's compound tools do the complete job in a single call:

| Tool | What it does |
|------|-------------|
| `rename_symbol` | LSP workspace rename with grep verification. Finds the symbol itself across monorepos — no file hint needed |
| `move_symbol` | Extracts a symbol from source, inserts into target, updates all imports. Per-language handlers for TS/JS, Python, Rust |
| `project` | Auto-detects toolchain across 20+ ecosystems (bun, cargo, go, pytest, xcodebuild, gradlew, flutter, dotnet, cmake...) and runs test/build/lint/typecheck with the right command — first try, every time |
| `discover_pattern` | Finds recurring code patterns for context-aware generation |
| `read_code` | Extracts a single symbol's source instead of dumping the whole file |
| `navigate` | Go-to-definition, find-references, call hierarchy — LSP-backed |
| `analyze` | Diagnostics, type info, outlines, unused detection, symbol diffs |

Design principle: **anything the agent currently guesses, push into the tool.** Tool output states facts confidently — never "run tests to verify" (which triggers verification spirals). Benchmark on `rename_symbol`: 19 steps → 3 steps, $0.228 → $0.036.

### Parallel Agents with Shared Memory

SoulForge dispatches subagents (explore, code, web-search) in parallel, coordinated through an in-process AgentBus:

- **Shared file cache** with waiter pattern — if agent A is reading a file, agent B awaits the same Promise instead of reading again
- **Tool result cache** (LRU, 200 entries) — grep/glob/read_code results are instant on the second call by any agent
- **Edit mutex** — serializes concurrent edits to the same file with ownership tracking
- **Real-time findings** — agents post discoveries to the bus; peers see them injected into their next step (~100ms latency)
- **Generation tracking** — reads check a generation counter to avoid overwriting fresher content from concurrent edits
- **Cache persistence** — exported between dispatch calls so the second dispatch starts warm

### Task Router — Per-Task Model Assignment

The task router lets you assign different LLM models to different task types. Use Opus for planning, Sonnet for coding, Haiku for exploration:

| Task Type | Description | Example |
|-----------|-------------|---------|
| `planning` | Plan mode, architecture decisions | `anthropic/claude-opus-4-20250514` |
| `coding` | File edits, implementation | `anthropic/claude-sonnet-4-20250514` |
| `exploration` | Read-only research, code analysis | `anthropic/claude-haiku-3-5-20241022` |
| `webSearch` | Web search and summarization | `openai/gpt-4o-mini` |
| `semantic` | Repo map semantic summaries | `anthropic/claude-haiku-3-5-20241022` |
| `default` | Fallback for unmatched tasks | Active model |

Configure via `/router` in the UI. Task detection is automatic based on message content.

### LLM Providers

SoulForge supports multiple LLM providers via the Vercel AI SDK:

| Provider | Env Variable | Models |
|----------|-------------|--------|
| **Anthropic** | `ANTHROPIC_API_KEY` | Claude Opus 4, Sonnet 4, Haiku 3.5 |
| **OpenAI** | `OPENAI_API_KEY` | GPT-4o, o3, o4-mini |
| **xAI** | `XAI_API_KEY` | Grok |
| **Google** | `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini |
| **Ollama** | *(none — runs locally)* | Llama, Mistral, Qwen, etc. |
| **AI Gateway** | `AI_GATEWAY_API_KEY` | All providers through a single key |
| **Proxy** | `PROXY_API_KEY` | Claude models via CLIProxyAPI (local relay) |

Switch models mid-conversation with `Ctrl+L`. OpenRouter metadata is fetched automatically for accurate context window detection across all providers.

### Proxy Provider (CLIProxyAPI)

SoulForge includes a built-in proxy provider that relays requests through a local [CLIProxyAPI](https://github.com/nicekid1/cli-proxy-api) instance. This lets you use Claude models without a direct Anthropic API key — the proxy handles authentication via the Claude web session.

- Auto-managed: SoulForge can install, start, and stop the proxy binary
- Default endpoint: `http://127.0.0.1:8317/v1`
- Install via `/proxy install`, authenticate via `/proxy login`
- Status check via `/proxy`

### Scoped Configuration

Every setting in SoulForge — model, mode, chat style, verbose output, diff style, neovim config, repo map, semantic summaries, co-author commits — can be saved to one of three scopes:

- **Session** — lost on exit (default for most settings)
- **Project** — saved to `.soulforge/config.json` in the project root
- **Global** — saved to `~/.soulforge/config.json` for all projects

Settings can be moved between scopes from the command picker. Project settings override global; session overrides both.

### Context Budget Inspector

`/context` opens a visual dashboard showing:
- Context window fill percentage with progress bar
- System prompt breakdown by section (mode instructions, repo map, memory, git, skills) with per-section token estimates and bars
- Session token usage (input/output/total, subagent breakdown)
- Cache hit rate with bar — shows how much of your input is served from Anthropic's prompt cache vs fresh processing

### Persistent Memory

SoulForge maintains a SQLite-backed memory system with three scopes (session, project, global). The AI can store decisions, patterns, and preferences that persist across conversations.

- `/memory` — configure write scope, read scope, view/clear by scope
- Read priority: session > project > global (closest scope wins)
- Memory appears in the system prompt automatically

### Storage Manager

`/storage` shows per-component disk usage across project and global storage:
- Repo map index, sessions, plans, memory DBs, history, config, binaries, fonts
- One-click cleanup for each component
- Database vacuum to reclaim space from deleted rows

### Embedded Neovim

A real Neovim instance runs inside SoulForge via msgpack-RPC. Your config, plugins, and LSP all work. The editor shares the intelligence layer — same language servers power both your editing and the AI's code tools.

Config modes:
- **auto** (default): Uses SoulForge's shipped init.lua if no user config exists, otherwise uses yours
- **user**: Always uses your own nvim config
- **default**: Always uses the shipped config (includes Mason for auto-installing LSP servers)
- **none**: Bare Neovim, no config

## Install

```bash
git clone https://github.com/proxysoul/soulforge
cd soulforge
bun install
bun run dev
```

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Neovim](https://neovim.io) >= 0.9
- A [Nerd Font](https://www.nerdfonts.com/) (for terminal icons)
- At least one LLM API key (see providers table above, or local Ollama)

See [GETTING_STARTED.md](GETTING_STARTED.md) for the full setup guide.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full technical reference.

**Stack**: Bun + TypeScript (strict) + OpenTUI (React for terminals) + Vercel AI SDK + Neovim + SQLite + tree-sitter + ts-morph

```
┌──────────────────────────────────────────────────────────────┐
│                        UI Layer (OpenTUI)                     │
│  App ─ TabBar ─ MessageList ─ InputBox ─ EditorPanel         │
│  Zustand stores: ui, errors, repomap, statusbar              │
├──────────────────────────────────────────────────────────────┤
│                     Agent Layer                               │
│  Forge (orchestrator) → dispatch → Code / Explore / WebSearch │
│  AgentBus: file cache, tool cache, findings, edit mutex       │
│  Task Router: per-task model assignment                       │
├──────────────────────────────────────────────────────────────┤
│                  Intelligence Layer                            │
│  Router: LSP → ts-morph → tree-sitter → regex                 │
│  RepoMap: SQLite graph, PageRank, co-change, semantic sums    │
│  ContextManager: system prompt, repo map, memory, git context │
├──────────────────────────────────────────────────────────────┤
│                     Tool Layer                                │
│  30+ tools: edit, read, grep, glob, shell, git, navigate,    │
│  analyze, refactor, rename_symbol, move_symbol, project,      │
│  read_code, web_search, fetch_page, discover_pattern, memory  │
├──────────────────────────────────────────────────────────────┤
│                   Runtime Layer                               │
│  Neovim (msgpack-RPC) ─ LSP servers ─ SQLite DBs ─ Bun       │
│  Providers: Anthropic, OpenAI, xAI, Google, Ollama, Proxy     │
└──────────────────────────────────────────────────────────────┘
```

## Deep Dives

- [Repo Map](docs/repo-map.md) — PageRank ranking, co-change analysis, semantic summaries, dynamic budgets
- [Compound Tools](docs/compound-tools.md) — design principles, benchmark results, tool reference
- [Agent Bus](docs/agent-bus.md) — parallel coordination, shared cache, edit mutex, findings

## Key Bindings

| Key | Action |
|-----|--------|
| `Ctrl+E` | Toggle editor panel / cycle focus |
| `Ctrl+L` | Switch LLM model |
| `Ctrl+D` | Cycle forge mode (default, architect, socratic, challenge, plan) |
| `Ctrl+G` | Git menu |
| `Ctrl+S` | Browse skills |
| `Ctrl+T` | Toggle plan sidebar |
| `Ctrl+X` | Stop generation |
| `Ctrl+R` | Fuzzy history search |
| `Shift+Enter` | Insert newline in input |
| `/` | Slash commands (type `/` to see all) |

## Slash Commands

### Chat & Session

| Command | Description |
|---------|-------------|
| `/clear` | Clear chat history |
| `/summarize`, `/compact` | Compact conversation context |
| `/continue` | Continue interrupted generation |
| `/context` | Show/clear context budget |
| `/context clear` | Reset conversation context |
| `/sessions` | Browse & restore sessions |
| `/tabs` | List open tabs |
| `/new-tab` | Open new tab (Alt+T) |
| `/close-tab` | Close current tab (Alt+W) |
| `/rename <name>` | Rename current tab |

### Editor & Display

| Command | Description |
|---------|-------------|
| `/editor` | Toggle editor panel |
| `/open <file>` | Open file in editor |
| `/editor-settings` | Toggle editor/LSP integrations |
| `/nvim-config` | Switch neovim config mode (auto/default/user/none) |
| `/panel` | Toggle side panel |
| `/changes` | Toggle changed files tree |
| `/diff` | Open diff in editor |
| `/diff-style` | Change diff display (default/sidebyside/compact) |
| `/chat-style` | Toggle chat layout style |
| `/verbose` | Toggle verbose tool output |
| `/reasoning` | Show or hide reasoning content |
| `/vim-hints` | Toggle vim keybinding hints |
| `/font` | Show/set terminal font |
| `/nerd-font` | Toggle Nerd Font icons |

### AI & Models

| Command | Description |
|---------|-------------|
| `/mode` | Switch forge mode (default/architect/socratic/challenge/plan) |
| `/plan` | Enter plan mode — research & plan only |
| `/router` | Assign models per task type |
| `/provider-settings` | Thinking, effort, speed, context management |
| `/web-search` | Web search keys & settings |

### Git

| Command | Description |
|---------|-------------|
| `/git` | Git menu |
| `/commit` | AI-assisted git commit |
| `/push` | Push to remote |
| `/pull` | Pull from remote |
| `/status` | Git status |
| `/diff` | Show diff |
| `/log` | Show recent commits |
| `/branch` | Show/create branch |
| `/stash` | Stash changes |
| `/stash pop` | Pop latest stash |
| `/init` | Initialize git repo |
| `/lazygit` | Launch lazygit |
| `/co-author-commits` | Toggle co-author trailer |

### System

| Command | Description |
|---------|-------------|
| `/proxy` | Proxy status |
| `/proxy install` | Install CLIProxyAPI |
| `/proxy login` | Authenticate with Claude |
| `/setup` | Check & install prerequisites |
| `/storage` | View & manage storage usage |
| `/memory` | Manage memory scopes, view & clear |
| `/repo-map` | Repo map settings (AST index) |
| `/skills` | Browse & install skills |
| `/errors` | Browse error log |
| `/privacy` | Manage forbidden file patterns |
| `/quit` | Exit SoulForge |
| `/restart` | Full restart |
| `/help` | Show available commands |

## Dev Commands

```bash
bun run dev          # start soulforge
bun run build        # build for distribution
bun run lint         # lint with biome
bun run lint:fix     # auto-fix lint issues
bun run format       # format with biome
bun run typecheck    # check types
```

## License

AGPL-3.0-only
