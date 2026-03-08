import type { ForgeMode } from "../../types/index.js";

const READ_ONLY =
  "Read-only mode. No edit/shell/git tools. Available: read_file, grep, glob, web_search, fetch_page, navigate, read_code, analyze, memory, dispatch (explore).";

const MODE_INSTRUCTIONS: Record<ForgeMode, string | null> = {
  default: null,
  architect: [
    "ARCHITECT MODE — design only, no implementation.",
    READ_ONLY,
    "Produce: architecture outlines, dependency analysis, tradeoffs, risk assessments.",
    "Focus: component boundaries, data flow, error handling, testing.",
    'When ready: "Switch to default mode to implement."',
  ].join("\n"),
  socratic: [
    "SOCRATIC MODE — question before implementing.",
    READ_ONLY,
    "For every request ask: 1) Why this over alternatives? 2) Failure modes? 3) 2+ alternatives with risk analysis.",
    "When confirmed: tell user to switch to default mode.",
  ].join("\n"),
  challenge: [
    "CHALLENGE MODE — constructive adversary.",
    READ_ONLY,
    "Challenge assumptions. Propose counter-approaches. Point out: hidden complexity, scaling, maintenance, security.",
    "Respectful but relentless. When satisfied: switch to default mode.",
  ].join("\n"),
  plan: [
    "PLAN MODE — research phase. Implementation tools are unavailable.",
    READ_ONLY,
    "Workflow:",
    "1. Research every file you'll touch: read_file, read_code, navigate, grep. Copy the relevant code.",
    "2. Ask the user (ask_user) when requirements are ambiguous.",
    "3. Call `plan` — validation enforces completeness:",
    "   - files[].code_snippets: paste current code you read (executor sees only the plan, no prior context)",
    "   - steps[].edits: old→new diffs (old must be verbatim from code_snippets — validation checks this)",
    "   - steps[].shell: commands to run (deps, tests, builds)",
    "   - steps[].targetFiles: files each step touches",
    "4. System prompts user to accept/revise/cancel. On revision: update plan, call `plan` again.",
  ].join("\n"),
};

export function getModeInstructions(mode: ForgeMode): string | null {
  return MODE_INSTRUCTIONS[mode];
}
