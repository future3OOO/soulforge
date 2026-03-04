# SoulForge

An AI-powered terminal IDE. Chat with LLMs, edit code in an embedded Neovim instance, run multi-step tool loops — all without leaving the terminal.

Built with Bun, TypeScript, Ink, and the Vercel AI SDK.

## Why

Most AI coding tools are either chat-only (no editor) or editor-only (no autonomy). SoulForge puts a real Neovim session and an agentic AI side by side in one terminal window. The AI can read files, edit code, run shell commands, search your codebase, and spawn subagents — while you watch, steer, or work alongside it in the editor.

## Install

```bash
git clone https://github.com/proxysoul/soulforge
cd soulforge
bun install
```

You need [Bun](https://bun.sh) and [Neovim](https://neovim.io) (>= 0.9). See [Getting Started](GETTING_STARTED.md) for detailed setup instructions and troubleshooting.

## API Keys

Set at least one:

```bash
export ANTHROPIC_API_KEY=sk-...    # Claude
export OPENAI_API_KEY=sk-...       # GPT
export XAI_API_KEY=...             # Grok
export GOOGLE_GENERATIVE_AI_API_KEY=...  # Gemini
```

Or use a single key for all providers via [Vercel AI Gateway](https://sdk.vercel.ai/docs/ai-sdk-core/provider-management):

```bash
export AI_GATEWAY_API_KEY=...
```

Ollama works too — no key needed, just have it running locally.

### Use Your Claude Subscription (Proxy Provider)

Have a Claude Pro/Max subscription? Skip the API key entirely. SoulForge can route requests through a local proxy that authenticates with your existing Claude account — giving you access to Opus, Sonnet, and Haiku at no extra API cost.

```bash
soulforge                  # start SoulForge
# then in chat:
/proxy login               # opens browser to authenticate with Claude
```

That's it. Select **Proxy** in the model picker (`Ctrl+L`) and you'll see all available Claude models grouped by sub-provider. The proxy binary ([CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)) is auto-installed and auto-started — no manual setup required.

See the [Proxy Provider](#proxy-provider) section below for details.

## Run

```bash
bun run dev
```

Or install globally:

```bash
bun link
soulforge     # or: sf
```

## What It Does

**Chat + Tools.** Ask Forge (the AI) anything. It can read and edit files, run shell commands, search with grep/glob, and manage git — all as tool calls you can watch in real time.

**Embedded Editor.** `Ctrl+E` opens a full Neovim instance inside the TUI. Your config, plugins, and LSP all work. Click or `Ctrl+E` to switch focus between editor and chat.

**Multi-Agent.** Forge delegates to subagents — an Explore agent for read-only research and a Code agent for implementation — each with their own context window and tool set.

**Multi-Provider.** Switch LLMs mid-conversation with `Ctrl+L`. Anthropic, OpenAI, xAI, Google, Ollama, a local proxy for Claude subscriptions, or any provider through the Vercel AI Gateway.

**Task Router.** Assign different models to different task types (planning, coding, exploration) via `/router`. Use Opus for architecture, Haiku for grep.

**Plan Mode.** `/plan` switches Forge to read-only research mode. It investigates, writes a plan, then asks for approval before executing.

**Modes.** `Ctrl+D` cycles through personas — default, architect (design only), socratic (asks before doing), challenge (devil's advocate), and plan.

**Sessions.** Conversations auto-save. `Ctrl+P` to browse and restore past sessions.

**Skills.** Extend Forge with markdown skill files. `Ctrl+S` to browse and install from the registry.

**Git.** `Ctrl+G` opens the git menu (commit, push, pull, stash, log). `/commit` generates an AI commit message. `/lazygit` launches lazygit fullscreen.

**Code Intelligence.** Forge understands your code structurally — not just as text. It can navigate to definitions, find references, read specific functions/classes, rename symbols across files, extract functions, and get type information — all via static analysis tools powered by ts-morph and tree-sitter.

## Proxy Provider

SoulForge includes a built-in proxy provider that lets you use your **Claude Pro or Max subscription** instead of paying for API credits. It runs a lightweight local proxy ([CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)) that authenticates with your Claude account via browser OAuth.

### How It Works

1. **Auto-install.** The first time you select the Proxy provider, SoulForge downloads the CLIProxyAPI binary for your platform (macOS arm64/amd64, Linux amd64/arm64) and installs it to `~/.soulforge/installs/`.

2. **Auto-start.** SoulForge spawns the proxy as a background process on `127.0.0.1:8317`, writes a config to `~/.soulforge/proxy/config.yaml`, and health-checks it automatically.

3. **Authenticate.** Run `/proxy login` once to open a browser window and authenticate with your Claude account. Credentials are stored locally in `~/.cli-proxy-api/`.

4. **Use it.** Press `Ctrl+L`, select **Proxy**, and pick any available Claude model. The proxy exposes an OpenAI-compatible `/v1` API, so models appear grouped by sub-provider (Anthropic, etc.) just like any other provider.

### Proxy Commands

```
/proxy              show proxy status (binary path, running/stopped)
/proxy login        authenticate with Claude via browser OAuth
/proxy install      manually install or reinstall CLIProxyAPI
```

### What You Get

Since the proxy speaks the Anthropic API natively, you get **full feature parity** with a direct API key:

- Extended thinking (adaptive/enabled)
- Effort levels and speed settings
- Context management (compact, clear thinking, clear tool uses)
- All Claude models — Opus 4, Sonnet 4, Haiku 3.5

### Configuration

The proxy works out of the box with zero config. If you need to customize:

| Environment Variable | Default | Description |
|---|---|---|
| `PROXY_API_URL` | `http://127.0.0.1:8317/v1` | Local proxy endpoint |
| `PROXY_API_KEY` | `soulforge` | Auth key for the local proxy |

The proxy is fully managed — SoulForge starts it when needed and stops it on exit.

## Keybindings

| Key | Action |
|-----|--------|
| `Ctrl+E` | Toggle editor / switch focus |
| `Ctrl+L` | Switch LLM model |
| `Ctrl+D` | Cycle forge mode |
| `Ctrl+G` | Git menu |
| `Ctrl+S` | Browse skills |
| `Ctrl+P` | Browse sessions |
| `Ctrl+K` | Clear chat |
| `Ctrl+X` | Stop generation |
| `Ctrl+T` | Toggle plan sidebar |
| `Ctrl+R` | Error log |
| `Ctrl+H` | Help |
| `Ctrl+C` | Quit |

Type `/help` in chat for the full command reference.

## Commands

A few highlights — `/help` shows the complete list.

```
/open <path>       open file in editor
/commit            AI-assisted git commit
/plan [task]       enter plan mode
/mode <name>       switch forge persona
/router            assign models per task type
/proxy             proxy status / login / install
/context           show context budget
/privacy add <pat> block files from AI access
/setup             check prerequisites
```

## License

[AGPL-3.0-only](LICENSE). You can use, modify, and distribute SoulForge freely — but if you run a modified version as a service, you must release your source code under the same license.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
