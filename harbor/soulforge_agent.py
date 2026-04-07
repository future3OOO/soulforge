"""
SoulForge agent adapter for Harbor Terminal-Bench.

Usage:
    harbor run -d terminal-bench/terminal-bench-2 \
        --agent-import-path soulforge_agent:SoulForge \
        --model anthropic/claude-sonnet-4-20250514 \
        --env daytona -n 32 -k 5
"""

import json
import os
import shlex
from pathlib import Path
from typing import Any

from harbor.agents.installed.base import (
    BaseInstalledAgent,
    CliFlag,
    EnvVar,
    with_prompt_template,
)
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext
from harbor.models.trajectories import (
    Agent,
    FinalMetrics,
    Metrics,
    Observation,
    ObservationResult,
    Step,
    ToolCall,
    Trajectory,
)
from harbor.models.trial.paths import EnvironmentPaths


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SOULFORGE_EVENTS_FILE = "/tmp/soulforge-events.jsonl"
SOULFORGE_STDERR_LOG = "/tmp/soulforge-stderr.log"

BUN_INSTALL_URL = "https://bun.sh/install"


class SoulForge(BaseInstalledAgent):
    """Harbor agent adapter for SoulForge — Graph-Powered Code Intelligence."""

    SUPPORTS_ATIF: bool = True

    CLI_FLAGS = [
        CliFlag(
            "max_steps",
            cli="--max-steps",
            type="int",
            env_fallback="SOULFORGE_MAX_STEPS",
        ),
        CliFlag(
            "timeout",
            cli="--timeout",
            type="int",
            env_fallback="SOULFORGE_TIMEOUT",
        ),
        CliFlag(
            "mode",
            cli="--mode",
            type="enum",
            choices=["default", "architect", "socratic", "challenge", "plan", "auto"],
            env_fallback="SOULFORGE_MODE",
        ),
    ]

    ENV_VARS = [
        EnvVar(
            "proxy_url",
            env="PROXY_API_URL",
            type="str",
            env_fallback="PROXY_API_URL",
        ),
        EnvVar(
            "proxy_key",
            env="PROXY_API_KEY",
            type="str",
            env_fallback="PROXY_API_KEY",
            default="soulforge",
        ),
    ]

    @staticmethod
    def name() -> str:
        return "soulforge"

    def get_version_command(self) -> str | None:
        return 'export PATH="$HOME/.bun/bin:$HOME/.bun/install/global/node_modules/.bin:$PATH"; soulforge --version'

    def parse_version(self, stdout: str) -> str:
        import re

        text = stdout.strip()
        match = re.search(r"(\d+\.\d+\.\d+)", text)
        if match:
            return match.group(1)
        return text

    # ------------------------------------------------------------------
    # Install
    # ------------------------------------------------------------------

    async def install(self, environment: BaseEnvironment) -> None:
        # Install system deps (root)
        await self.exec_as_root(
            environment,
            command=(
                "if command -v apk &> /dev/null; then"
                "  apk add --no-cache curl bash git unzip;"
                " elif command -v apt-get &> /dev/null; then"
                "  apt-get update && apt-get install -y curl git unzip;"
                " elif command -v yum &> /dev/null; then"
                "  yum install -y curl git unzip;"
                " fi"
            ),
            env={"DEBIAN_FRONTEND": "noninteractive"},
        )

        # Step 1: Install Bun
        await self.exec_as_agent(
            environment,
            command=(
                f"curl -fsSL {BUN_INSTALL_URL} | bash"
            ),
        )

        # Step 2: Install @proxysoul/soulforge
        version_spec = f"@{self._version}" if self._version else ""
        await self.exec_as_agent(
            environment,
            command=(
                'export PATH="$HOME/.bun/bin:$PATH" && '
                f"bun install -g @proxysoul/soulforge{version_spec}"
            ),
        )

        # Step 3: Verify
        await self.exec_as_agent(
            environment,
            command=(
                'export PATH="$HOME/.bun/bin:$HOME/.bun/install/global/node_modules/.bin:$PATH" && '
                "soulforge --version"
            ),
        )

    # ------------------------------------------------------------------
    # Run
    # ------------------------------------------------------------------

    @with_prompt_template
    async def run(
        self, instruction: str, environment: BaseEnvironment, context: AgentContext
    ) -> None:
        escaped_instruction = shlex.quote(instruction)

        env: dict[str, str] = {}

        # Pass through the API key for the model provider
        if self.model_name:
            provider = self.model_name.split("/")[0] if "/" in self.model_name else ""
            key_vars = _provider_key_vars(provider)
            for var in key_vars:
                val = os.environ.get(var, "")
                if val:
                    env[var] = val

        # Proxy support: pass PROXY_API_URL and PROXY_API_KEY into the container
        # so SoulForge's built-in proxy provider routes through cli-proxy-api.
        # Usage: --model proxy/claude-sonnet-4-6 with PROXY_API_URL set externally.
        env.update(self._resolved_env_vars)

        # Model override
        model_flag = ""
        if self.model_name:
            model_flag = f"--model {shlex.quote(self.model_name)} "

        # Build CLI flags from descriptors (--max-steps, --timeout, --mode)
        cli_flags = self.build_cli_flags()
        extra_flags = (cli_flags + " ") if cli_flags else ""

        # SoulForge headless with JSONL event stream
        # --cwd /app: Terminal-Bench tasks work in /app
        # --events: JSONL stream for ATIF trajectory conversion
        # --quiet: suppress stderr header/footer noise
        # --diff: include files changed in done event
        # --save-session: persist session for debugging
        await self.exec_as_agent(
            environment,
            command=(
                'export PATH="$HOME/.bun/bin:$HOME/.bun/install/global/node_modules/.bin:$PATH"; '
                f"soulforge --headless "
                f"--events "
                f"--quiet "
                f"--diff "
                f"--save-session "
                f"--cwd /app "
                f"{model_flag}"
                f"{extra_flags}"
                f"{escaped_instruction} "
                f"> {SOULFORGE_EVENTS_FILE} "
                f"2> {SOULFORGE_STDERR_LOG} "
                f"|| true"  # Don't fail on non-zero exit — we parse events
            ),
            env=env,
        )

        # Download the events file from the environment
        events_local = self.logs_dir / "soulforge-events.jsonl"
        stderr_local = self.logs_dir / "soulforge-stderr.log"

        try:
            await environment.download_file(SOULFORGE_EVENTS_FILE, events_local)
        except Exception as exc:
            self.logger.debug(f"Failed to download events file: {exc}")

        try:
            await environment.download_file(SOULFORGE_STDERR_LOG, stderr_local)
        except Exception as exc:
            self.logger.debug(f"Failed to download stderr log: {exc}")

    # ------------------------------------------------------------------
    # Post-run: parse JSONL events → ATIF trajectory
    # ------------------------------------------------------------------

    def populate_context_post_run(self, context: AgentContext) -> None:
        events_file = self.logs_dir / "soulforge-events.jsonl"
        if not events_file.exists():
            self.logger.debug("No SoulForge events file found")
            return

        events = _parse_jsonl(events_file)
        if not events:
            self.logger.debug("No events parsed from SoulForge output")
            return

        trajectory = self._events_to_trajectory(events)
        if not trajectory:
            return

        # Write trajectory.json
        trajectory_path = self.logs_dir / "trajectory.json"
        try:
            with open(trajectory_path, "w", encoding="utf-8") as f:
                json.dump(trajectory.to_json_dict(), f, indent=2, ensure_ascii=False)
            self.logger.debug(f"Wrote SoulForge trajectory to {trajectory_path}")
        except OSError as exc:
            self.logger.debug(f"Failed to write trajectory: {exc}")

        # Populate context metrics
        if trajectory.final_metrics:
            m = trajectory.final_metrics
            context.n_input_tokens = m.total_prompt_tokens or 0
            context.n_output_tokens = m.total_completion_tokens or 0
            context.n_cache_tokens = m.total_cached_tokens or 0
            context.cost_usd = m.total_cost_usd

    def _events_to_trajectory(self, events: list[dict]) -> Trajectory | None:
        """Convert SoulForge JSONL events to an ATIF trajectory.

        SoulForge --events emits these event types:
            start       — model, mode, repoMap stats
            text        — streaming text chunk
            tool-call   — tool invocation
            tool-result — tool result (summary)
            step        — step completed with cumulative tokens
            error       — error occurred
            done        — final summary with totals
        """
        steps: list[Step] = []
        step_id = 0

        # Extract metadata from start/done events
        start_event = next((e for e in events if e.get("type") == "start"), None)
        done_event = next((e for e in events if e.get("type") == "done"), None)

        model_name = None
        if start_event:
            model_name = start_event.get("model")

        # Accumulate text and tool calls between "step" boundaries
        current_text_parts: list[str] = []
        current_tool_calls: list[dict] = []
        current_tool_results: dict[str, str] = {}

        # Track per-step token deltas from cumulative totals
        prev_tokens = {"input": 0, "output": 0, "cacheRead": 0}

        for event in events:
            etype = event.get("type")

            if etype == "text":
                content = event.get("content", "")
                if content:
                    current_text_parts.append(content)

            elif etype == "tool-call":
                tool_name = event.get("tool", "unknown")
                current_tool_calls.append({"tool": tool_name})

            elif etype == "tool-result":
                tool_name = event.get("tool", "unknown")
                summary = event.get("summary", "")
                current_tool_results[tool_name] = summary

            elif etype == "step":
                step_id += 1
                tokens = event.get("tokens", {})

                # Compute per-step deltas
                input_delta = tokens.get("input", 0) - prev_tokens["input"]
                output_delta = tokens.get("output", 0) - prev_tokens["output"]
                cache_delta = tokens.get("cacheRead", 0) - prev_tokens["cacheRead"]
                prev_tokens = {
                    "input": tokens.get("input", 0),
                    "output": tokens.get("output", 0),
                    "cacheRead": tokens.get("cacheRead", 0),
                }

                metrics = Metrics(
                    prompt_tokens=input_delta if input_delta > 0 else None,
                    completion_tokens=output_delta if output_delta > 0 else None,
                    cached_tokens=cache_delta if cache_delta > 0 else None,
                )

                message_text = "".join(current_text_parts).strip()

                # Build ATIF tool calls and observations
                atif_tool_calls: list[ToolCall] = []
                observation_results: list[ObservationResult] = []

                for i, tc in enumerate(current_tool_calls):
                    call_id = f"call_{step_id}_{i}"
                    tool_name = tc["tool"]
                    atif_tool_calls.append(
                        ToolCall(
                            tool_call_id=call_id,
                            function_name=tool_name,
                            arguments={},
                        )
                    )
                    result_content = current_tool_results.get(tool_name)
                    observation_results.append(
                        ObservationResult(
                            source_call_id=call_id,
                            content=result_content,
                        )
                    )

                observation = (
                    Observation(results=observation_results)
                    if observation_results
                    else None
                )

                step = Step(
                    step_id=step_id,
                    source="agent",
                    message=message_text or f"Step {step_id}",
                    model_name=model_name,
                    tool_calls=atif_tool_calls if atif_tool_calls else None,
                    observation=observation,
                    metrics=metrics,
                )
                steps.append(step)

                # Reset accumulators
                current_text_parts = []
                current_tool_calls = []
                current_tool_results = {}

        if not steps:
            self.logger.debug("No steps produced from SoulForge events")
            return None

        # Build final metrics from the done event
        total_input = 0
        total_output = 0
        total_cached = 0

        if done_event:
            done_tokens = done_event.get("tokens", {})
            total_input = done_tokens.get("input", 0)
            total_output = done_tokens.get("output", 0)
            total_cached = done_tokens.get("cacheRead", 0)
        else:
            for s in steps:
                if s.metrics:
                    total_input += s.metrics.prompt_tokens or 0
                    total_output += s.metrics.completion_tokens or 0
                    total_cached += s.metrics.cached_tokens or 0

        duration_ms = done_event.get("duration") if done_event else None
        done_extra: dict[str, Any] | None = None
        if duration_ms is not None:
            done_extra = {"duration_ms": duration_ms}

        files_edited = done_event.get("filesEdited", []) if done_event else []
        if files_edited:
            done_extra = done_extra or {}
            done_extra["files_edited"] = files_edited

        final_metrics = FinalMetrics(
            total_prompt_tokens=total_input or None,
            total_completion_tokens=total_output or None,
            total_cached_tokens=total_cached or None,
            total_cost_usd=None,
            total_steps=len(steps),
            extra=done_extra,
        )

        agent_extra: dict[str, Any] | None = None
        if start_event:
            repo_map = start_event.get("repoMap")
            mode = start_event.get("mode")
            if repo_map or mode:
                agent_extra = {}
                if repo_map:
                    agent_extra["repo_map"] = repo_map
                if mode:
                    agent_extra["mode"] = mode

        trajectory = Trajectory(
            schema_version="ATIF-v1.4",
            session_id="soulforge-session",
            agent=Agent(
                name="soulforge",
                version=self.version() or "unknown",
                model_name=model_name,
                extra=agent_extra,
            ),
            steps=steps,
            final_metrics=final_metrics,
        )

        return trajectory


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_jsonl(path: Path) -> list[dict]:
    """Parse a JSONL file, skipping malformed lines."""
    events: list[dict] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if not stripped:
                continue
            try:
                events.append(json.loads(stripped))
            except json.JSONDecodeError:
                continue
    return events


def _provider_key_vars(provider: str) -> list[str]:
    """Map a provider name to its API key environment variable(s)."""
    mapping: dict[str, list[str]] = {
        "anthropic": ["ANTHROPIC_API_KEY"],
        "openai": ["OPENAI_API_KEY"],
        "google": ["GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY"],
        "xai": ["XAI_API_KEY"],
        "groq": ["GROQ_API_KEY"],
        "deepseek": ["DEEPSEEK_API_KEY"],
        "mistral": ["MISTRAL_API_KEY"],
        "fireworks": ["FIREWORKS_API_KEY"],
        "openrouter": ["OPENROUTER_API_KEY"],
        "together": ["TOGETHER_API_KEY"],
    }
    return mapping.get(provider, [f"{provider.upper()}_API_KEY"])
