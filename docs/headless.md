# Headless Mode

Run SoulForge without the TUI — pipe in a prompt, get back results. For CI/CD, automation, scripting, and batch processing.

## Quick Start

```bash
# Inline prompt
soulforge --headless "explain the auth middleware"

# Pipe a prompt from stdin
echo "find all unused exports" | soulforge --headless

# From a file
cat prompt.txt | soulforge --headless

# JSON output for scripting
soulforge --headless --json "list all TODO comments"

# Override model
soulforge --headless --model anthropic/claude-sonnet-4-20250514 "refactor store.ts"
```

## CLI Flags

### Headless Execution

| Flag | Description |
|------|-------------|
| `--headless <prompt>` | Run without TUI. Prompt is all non-flag arguments joined. |
| `--model <provider/model>` | Override the configured default model. |
| `--json` | Output structured JSON instead of streaming text. |

When no prompt arguments are given and stdin is not a TTY, the prompt is read from stdin.

### Provider & Model Management

These work standalone — no `--headless` needed:

```bash
soulforge --list-providers                   # Show providers + key status
soulforge --list-models                      # Show models for all configured providers
soulforge --list-models anthropic            # Show models for a specific provider
soulforge --set-key anthropic sk-ant-...     # Save API key to system keychain
```

| Flag | Description |
|------|-------------|
| `--list-providers` | Show all providers with availability status and env var names. |
| `--list-models [provider]` | List available models. Without a provider, shows all configured providers. |
| `--set-key <provider> <key>` | Save an API key to the system keychain (macOS Keychain, Linux secret-tool). |

`--set-key` works with all built-in providers (`anthropic`, `openai`, `google`, `xai`, `openrouter`, `llmgateway`, `vercel_gateway`) and any custom provider that has an `envVar` configured.

## Output

### Streaming (default)

Agent text streams to **stdout** in real time. Status messages (model info, repo map stats, token summary) go to **stderr**, so they don't pollute piped output.

```bash
# Only agent output goes to the file
soulforge --headless "summarize the architecture" > summary.txt

# stderr shows progress
# Model: anthropic/claude-sonnet-4-20250514
# Repo:  847 files, 12340 symbols
# ────────────────────────────────────────
# ... (agent streams to stdout) ...
# ────────────────────────────────────────
# 3 steps — 12.1k in, 2.1k out, 89% cached — 8.4s
```

### JSON mode

With `--json`, a single JSON object is written to stdout after the agent completes:

```json
{
  "model": "anthropic/claude-sonnet-4-20250514",
  "prompt": "list all unused exports",
  "output": "Found 12 unused exports across 8 files...",
  "steps": 4,
  "tokens": {
    "input": 8234,
    "output": 1456,
    "cacheRead": 6100
  },
  "toolCalls": ["soul_analyze", "read_file", "read_file"],
  "duration": 12345
}
```

On error, an `"error"` field is included and the process exits with code 1.

## What's Available

Headless mode runs the full Forge agent with all tools:

- **All 30+ tools** — read, edit, shell, grep, glob, soul_grep, soul_find, soul_analyze, soul_impact, navigate, refactor, rename_symbol, move_symbol, project, memory, git
- **Multi-agent dispatch** — parallel subagents with shared cache
- **Repo map** — tree-sitter analysis, PageRank, cochange, blast radius
- **Intelligence layer** — LSP, ts-morph, tree-sitter fallback chain
- **Context management** — compaction, tool result pruning
- **Provider options** — prompt caching, thinking modes

## What's Skipped

- Splash animation and TUI renderer
- Neovim editor embedding
- Interactive approval prompts (destructive actions, out-of-cwd access auto-allowed)
- Keyboard shortcuts and modal UI
- Plan review flow
- User steering (no stdin during execution)

## Examples

### CI/CD: lint and fix

```bash
soulforge --headless "run the linter, fix all issues, then verify typecheck passes"
```

### Scripting: batch analysis

```bash
for dir in packages/*/; do
  echo "analyze $dir for unused exports" | soulforge --headless --json >> report.jsonl
done
```

### Automation: generate and pipe

```bash
soulforge --headless --json "list all files that import from legacy/" | jq '.output'
```

### Quick answers

```bash
soulforge --headless "what does the dispatch tool do?"
```

## Configuration

Headless mode reads the same config files as the TUI:

- Global: `~/.soulforge/config.json`
- Project: `.soulforge/config.json`

The `defaultModel` from config is used unless `--model` is passed. If no model is configured and no `--model` flag is given, headless exits with an error.

## Custom Providers

Add any OpenAI-compatible API as a provider via config — no code changes needed.

### Config

Add a `providers` array to your global (`~/.soulforge/config.json`) or project (`.soulforge/config.json`) config:

```json
{
  "providers": [
    {
      "id": "deepseek",
      "name": "DeepSeek",
      "baseURL": "https://api.deepseek.com/v1",
      "envVar": "DEEPSEEK_API_KEY",
      "models": ["deepseek-chat", "deepseek-coder"]
    }
  ]
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Provider ID, used in model strings like `deepseek/deepseek-chat`. |
| `name` | No | Display name. Defaults to `id`. |
| `baseURL` | Yes | OpenAI-compatible API endpoint. |
| `envVar` | No | Env var name for the API key (e.g. `DEEPSEEK_API_KEY`). |
| `models` | No | Fallback model list — strings or `{id, name, contextWindow}` objects. |
| `modelsAPI` | No | URL to fetch models dynamically (expects OpenAI `/v1/models` response format). |

### Scoping

- **Global** (`~/.soulforge/config.json`) — available in all projects.
- **Project** (`.soulforge/config.json`) — project-specific providers. Override global entries with the same `id`.

### Conflict Handling

If a custom provider `id` matches a built-in (e.g. `"id": "anthropic"`), it auto-renames to `{id}-custom` so both coexist. The built-in is never replaced. Custom providers always show `[custom]` in `--list-providers` and `--list-models`.

### Usage

Once configured, use the provider anywhere:

```bash
# Headless
soulforge --headless --model deepseek/deepseek-chat "explain this code"

# Set API key
soulforge --set-key deepseek sk-...

# List models
soulforge --list-models deepseek
```

In the TUI, custom providers appear in the model picker (`Ctrl+L`) and can be assigned to task router slots.

### Examples

**Local LLM server (no API key):**
```json
{
  "providers": [{
    "id": "local",
    "name": "Local LLM",
    "baseURL": "http://localhost:8080/v1",
    "models": ["llama-3-70b"]
  }]
}
```

**Corporate proxy:**
```json
{
  "providers": [{
    "id": "corp",
    "name": "Corp API Gateway",
    "baseURL": "https://llm.internal.corp.com/v1",
    "envVar": "CORP_LLM_KEY",
    "modelsAPI": "https://llm.internal.corp.com/v1/models"
  }]
}
```

**Multiple custom providers:**
```json
{
  "providers": [
    { "id": "deepseek", "baseURL": "https://api.deepseek.com/v1", "envVar": "DEEPSEEK_API_KEY", "models": ["deepseek-chat"] },
    { "id": "together", "baseURL": "https://api.together.xyz/v1", "envVar": "TOGETHER_API_KEY", "models": ["meta-llama/Llama-3-70b-chat-hf"] },
    { "id": "groq", "baseURL": "https://api.groq.com/openai/v1", "envVar": "GROQ_API_KEY", "modelsAPI": "https://api.groq.com/openai/v1/models" }
  ]
}
```

## Architecture

Headless bypasses the entire TUI stack. The call path is:

```
boot.tsx (--headless detected)
  → headless.ts
    → loadConfig() + loadProjectConfig()
    → ContextManager.createAsync()  (repo map, memory)
    → resolveModel() + buildProviderOptions()
    → createForgeAgent()            (same agent as TUI)
    → agent.stream()                (async iterator)
    → stdout                        (text or JSON)
```

The `createForgeAgent()` factory is shared with the TUI — same tools, same prompts, same agent loop. The only difference is no interactive callbacks (approval prompts auto-allow) and no renderer.
