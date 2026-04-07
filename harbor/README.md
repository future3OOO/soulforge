# SoulForge × Terminal-Bench 2.0

Harbor agent adapter for running SoulForge on Terminal-Bench and submitting to the leaderboard.

## Prerequisites

```bash
# Install Harbor
uv tool install harbor

# Verify with oracle
harbor run -d terminal-bench/terminal-bench-2 -a oracle
```

## Running the benchmark

```bash
# Local (Docker) - small scale
harbor run -d terminal-bench/terminal-bench-2 \
  --agent-import-path soulforge_agent:SoulForge \
  --model <provider/model> \
  -k 5 -n 4

# Cloud (Daytona) - full scale for leaderboard
harbor run -d terminal-bench/terminal-bench-2 \
  --agent-import-path soulforge_agent:SoulForge \
  --model <provider/model> \
  --env daytona \
  -k 5 -n 32
```

Set the appropriate API key environment variable for your provider before running
(e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.).

### Agent kwargs

Pass via `--ak key=value`:

| kwarg | CLI flag / env var | description |
|-------|-------------------|-------------|
| `max_steps` | `--max-steps` / `SOULFORGE_MAX_STEPS` | Limit agent steps |
| `timeout` | `--timeout` / `SOULFORGE_TIMEOUT` | Abort after N ms |
| `mode` | `--mode` / `SOULFORGE_MODE` | Forge mode (default/architect/auto) |

Example:
```bash
harbor run -d terminal-bench/terminal-bench-2 \
  --agent-import-path soulforge_agent:SoulForge \
  --model <provider/model> \
  --ak max_steps=50 --ak mode=auto \
  -k 5 -n 32
```

## Submitting to the leaderboard

After the run completes, Harbor produces job directories with `result.json` files.

1. Fork [harborframework/terminal-bench-2-leaderboard](https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard)
2. Create a branch
3. Copy your results:
   ```
   submissions/terminal-bench/2.0/soulforge__<model>/
     metadata.yaml       # Use harbor/metadata.yaml as template
     <job-folder>/
       config.json
       <trial-1>/result.json
       <trial-2>/result.json
       ...
   ```
4. Open a PR - the bot validates automatically

### Leaderboard rules

- **5 trials minimum** per task (`-k 5`)
- No timeout/resource overrides
- No access to terminal-bench.org or its GitHub repo
- `timeout_multiplier` must be `1.0`

## How it works

The adapter:

1. **Installs** Bun + SoulForge into the container via `bun install -g @proxysoul/soulforge`
2. **Runs** `soulforge --headless --events <instruction>` which streams JSONL events
3. **Parses** the JSONL event stream into ATIF v1.4 trajectory format
4. **Reports** token usage and tool calls back to Harbor

SoulForge runs with its full toolset in headless mode - all 35+ tools, multi-agent dispatch, Soul Map, LSP intelligence layer, and context management. Interactive prompts are auto-approved.
