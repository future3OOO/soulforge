# Getting Started with SoulForge

SoulForge is an AI-powered terminal IDE. It runs entirely in your terminal — combining a chat interface, an embedded Neovim editor, and an agentic tool loop that can read files, write code, run commands, and search your codebase.

---

## Prerequisites

Before you start, make sure you have:

### 1. Bun

SoulForge runs on [Bun](https://bun.sh), not Node.js.

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# macOS via Homebrew
brew install bun
```

Verify: `bun --version` (need ≥ 1.0)

### 2. Neovim ≥ 0.9.0

Neovim is required — SoulForge embeds it as a real editor panel inside the TUI.

```bash
# macOS
brew install neovim

# Ubuntu / Debian
sudo apt install neovim

# Arch
sudo pacman -S neovim

# Windows (via Scoop)
scoop install neovim
```

Verify: `nvim --version`

### 3. An LLM API Key

You need at least one:

| Provider | Environment Variable |
|---|---|
| Anthropic (Claude) | `ANTHROPIC_API_KEY` |
| OpenAI (GPT-4o, o3) | `OPENAI_API_KEY` |
| xAI (Grok) | `XAI_API_KEY` |
| Google (Gemini) | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Vercel AI Gateway *(replaces all of the above)* | `AI_GATEWAY_API_KEY` |

Add your key(s) to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

---

## Installation

```bash
git clone https://github.com/proxysoul/soulforge
cd soulforge
bun install
```

---

## Running SoulForge

```bash
bun run dev
```

That's it. SoulForge will start, detect your Neovim binary, and drop you into the chat interface.

> **First run:** If no config exists, one will be created at `~/.proxy/config.json` with sensible defaults.

---

## The Interface

When SoulForge starts you'll see:

- **Banner** — animated SoulForge ASCII logo
- **Chat area** — where you talk to Forge
- **Status bar** — shows active provider, model, working directory, and message count
- **Input box** — type here to chat or run slash commands
- **Footer** — keybinding legend

---

## Keybindings

| Key | Action |
|---|---|
| `Ctrl+E` | Toggle the Neovim editor panel |
| `Ctrl+L` | Switch LLM provider / model |
| `Ctrl+S` | Open the Skills browser |
| `Ctrl+K` | Clear chat history |
| `Ctrl+H` | Show help |
| `Ctrl+C` | Exit SoulForge |

### Editor Focus States (Ctrl+E cycles through)

1. **Editor closed** → press `Ctrl+E` → editor opens, Neovim is focused
2. **Editor focused** → press `Ctrl+E` → editor stays open, chat is focused
3. **Chat focused** → press `Ctrl+E` → editor closes

When Neovim is focused, all keystrokes go directly to Neovim. Use it exactly like normal Neovim.

---

## Slash Commands

Type `/` in the input box to see available commands:

| Command | Action |
|---|---|
| `/help` | Show help |
| `/clear` | Clear chat history |
| `/editor` or `/edit` | Toggle editor panel |
| `/open <path>` | Open a file in Neovim |
| `/skills` | Open skills browser |
| `/quit` or `/exit` | Exit SoulForge |

---

## Switching Models

Press `Ctrl+L` to open the model picker. Select a provider, then pick a model from the live list. The switch takes effect on the next message — you can change models mid-session anytime.

---

## Skills

Skills are knowledge modules that extend what Forge knows and how it behaves. Press `Ctrl+S` (or type `/skills`) to open the skills browser.

The browser has three tabs:

- **Search** — browse and install skills from the [skills.sh](https://skills.sh) community registry
- **Installed** — skills already on your machine (looks for `SKILL.md` files in `~/.agents/skills/`, `~/.claude/skills/`, and local equivalents)
- **Active** — skills currently loaded into the active session

---

## What Forge Can Do

Forge is not just a chatbot. It runs an agentic tool loop and can:

- 📖 **Read files** — with line numbers, respecting your working directory
- ✏️ **Edit files** — exact string replacement or create new files
- 🖥️ **Run shell commands** — any `sh -c` compatible command, 30s timeout
- 🔍 **Search with ripgrep** — regex search across your codebase
- 📁 **Glob files** — find files by pattern using `fd`

For larger tasks it can delegate to specialized subagents:

- **Explore subagent** — read-only, used for deep research and codebase understanding
- **Code subagent** — full tool access, used for implementing multi-step changes, runs lint/typecheck after edits

---

## Config

Config lives at `~/.proxy/config.json`. It's created automatically on first run. You can edit it manually:

```json
{
  "defaultModel": "anthropic/claude-3-haiku-20240307",
  "editor": {
    "command": "nvim",
    "args": []
  },
  "theme": {
    "accentColor": "#7C3AED"
  }
}
```

---

## Troubleshooting

**SoulForge won't start — "Neovim not found"**
Install Neovim ≥ 0.9.0 and make sure `nvim` is on your `PATH`. You can also set `nvimPath` in `~/.proxy/config.json` to an explicit binary path.

**No models showing up in Ctrl+L**
Make sure the relevant API key env var is set and exported in your shell. Restart SoulForge after adding new keys.

**Editor panel looks garbled**
Make sure your terminal emulator supports true color (`COLORTERM=truecolor`) and you're using a [Nerd Font](https://www.nerdfonts.com/) for proper icons.

**Forge seems slow or times out**
Try switching to a faster model with `Ctrl+L` (e.g. `claude-3-haiku` or `gpt-4o-mini`). Shell tool calls have a 30-second timeout.

---

## Next Steps

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) if you want to hack on SoulForge itself
- Check out [skills.sh](https://skills.sh) for community skills
- Open an issue on GitHub if something's broken
