# SoulForge Token Architecture Audit — Full Sweep

Date: 2026-03-14

---

## Token Budget Per API Call

| Component | Tokens | % of 200k | Notes |
|-----------|--------|-----------|-------|
| Static preamble + rules | ~1,500 | 0.8% | Always included |
| Tool schemas (41 tools) | ~2,000 | 1% | All tool descriptions + Zod schemas |
| Repo map (rendered) | 500–5,000 | 0.3–2.5% | Binary search fits files within `conversationTokens / 4` budget, cached 5s |
| Project info + git context | ~200–500 | 0.1–0.25% | Toolchain detection, recent commits |
| Memory index | ~200–800 | 0.1–0.4% | Capped at ~800 chars |
| Forbidden context | ~100–500 | 0.05–0.25% | Forbidden file patterns |
| Mode instructions | ~200–500 | 0.1–0.25% | architect/socratic/challenge/plan |
| **Total system overhead** | **4,300–8,800** | **2–4.5%** | Cached by Anthropic ephemeral cache after first call |

### Subagent Overhead (per agent)

| Component | Tokens | Notes |
|-----------|--------|-------|
| System prompt (explore/code base) | ~270–450 | Lean — no repo map text, no tool guidance |
| Tool schemas (14–19 tools) | 2,000–2,500 | Smaller set than main agent |
| Bus coordination tools | 500–600 | report_finding, check_peers, etc. |
| Task enrichment (peer objectives + dep results + findings) | 100–2,000 | Variable, grows with dispatch complexity |
| **Total per subagent** | **~2,800–5,500** | Before any actual tool calls |

### Dispatch Token Costs (Total)

| Scenario | Token Range | Notes |
|----------|-------------|-------|
| Quick 1-agent (trivial task) | 3–10k | Single file read + summary |
| Standard 1-agent | 15–40k | 5-10 tool calls + enrichment |
| Typical 2-agent dispatch | 100–180k | Most common production scenario |
| Max 3-agent near budget | 250–350k | Near-full budget utilization |
| + Desloppify pass | +0–50k | Only if code agents edited files |

### Agent Token Budgets (Hard Stops)

| Agent Type | Budget | Max Steps |
|-----------|--------|-----------|
| Explore | 80,000 | 15 |
| Code | 150,000 | 25 |
| Desloppify | Unbounded | — |

---

## Conversation Token Lifecycle

### Flow

```
User Input
  → Add to coreMessages
  → Extract to WorkingState (v2)
  → Track in ContextManager
  → streamText() API call
    → buildPrepareStep() transforms messages:
      1. Capture tool call path map
      2. Sanitize malformed inputs
      3. Apply Anthropic ephemeral cache (step 1+)
      4. Compact old tool results (step 3+, Level 1 pruning)
      5. Inject system context (bus summary, token warnings)
  → Stream response + tool calls
  → finish-step: actual token counts, incremental session save
  → Add responseMessages to coreMessages
  → Loop until done

Auto-trigger check (continuous useEffect):
  totalChars = systemChars + chatChars
  contextBudgetChars = getModelContextWindow(activeModel) * 3  ← ISSUE: hardcoded ratio
  pct = totalChars / contextBudgetChars
  Trigger compaction when pct > 0.7 (default)
  Reset when pct < 0.4
  Min 6 messages required
```

### Level 1 Pruning (Rolling Window)

- **When:** Step 3+, messages.length > KEEP_RECENT_MESSAGES (4)
- **What:** Older tool results from SUMMARIZABLE_TOOLS → 1-line summaries
- **17 summarizable tools:** read_file, read_code, grep, glob, navigate, analyze, web_search, fetch_page, shell, dispatch, list_dir, soul_grep, soul_find, soul_analyze, soul_impact, memory_search, memory_list
- **Never pruned:** edit_file, multi_edit, write_file, create_file (EDIT_TOOLS)
- **Min threshold:** Content ≤ 200 chars never summarized

**Summary formats:**
| Tool | Format |
|------|--------|
| read_file / read_code | `[pruned] N lines — exports: sym1, sym2...` (8 syms max) |
| grep | `[pruned] N matches` |
| glob | `[pruned] N files` |
| shell | `[pruned] N lines of output` |
| dispatch | `[pruned] dispatch completed — files...` |
| list_dir | `[pruned] N entries` |
| soul_grep / soul_find | `[pruned] N results` |
| soul_analyze / soul_impact | `[pruned] first_line_truncated_120_chars` |
| memory_search / memory_list | `[pruned] N memories` |

### Compaction (V1)

- **Trigger:** 70% context window (configurable)
- **Model:** Task-router selected or default
- **Output budget:** 8,192 tokens
- **Input truncation:** 6k chars/msg text, 8k chars/tool result, 3k chars/other parts
- **Result:** Summary message + ack + last 4 recent messages replace older history

### Compaction (V2 — opt-in)

- **Incremental extraction:** Free, tracks as-you-go via WorkingStateManager
- **WSM tracks:** Task, Plan, Files touched, Decisions, Failures, Discoveries, Environment, Tool results (max 30 slots FIFO)
- **Optional LLM gap-fill:** 2,048 token budget (vs v1's 8k)
- **Post-compact:** WSM.reset() clears stale state

---

## Tool Output Size Audit

| Tool | Max Output | Bounded? | Risk |
|------|-----------|----------|------|
| **read_file** | **Entire file (no limit)** | **NO** | **HIGH — 5000-line file = ~15k tokens** |
| read_code | Single symbol | Yes (symbol scope) | Low |
| grep | 50 matches, 256KB file limit | Yes | Low |
| soul_grep | 50 matches / 25 count entries | Yes | Low |
| glob | 50 paths | Yes | Low |
| soul_find | 20 default, 500 max | Yes | Low |
| shell | 16KB (MAX_OUTPUT_BYTES) | Yes | Low |
| project | 10KB (3k head + 5k tail) | Yes | Low |
| fetch_page | 16KB + links section | Yes | Low |
| **navigate** | **No limit** | **NO** | **MEDIUM — workspace_symbols/references can be huge** |
| **analyze** | **No limit** | **NO** | **MEDIUM — diagnostics can be large** |
| **dispatch (done result)** | **No limit** | **NO** | **HIGH — formatDoneResult() uncapped** |
| dispatch (fallback) | 16k total / 4k per result | Yes | Low |
| soul_analyze | Query-bounded | Mostly | Low |
| soul_impact | 20 max per category + "+ X more" | Yes | Low |

---

## Gaps & Token Leaks — Priority Ranked

### P0: High Impact, Easy Fix

#### 1. `read_file` returns entire files with NO truncation
- **File:** `src/core/tools/read-file.ts`
- **Problem:** A 5,000-line file dumps ~15k tokens into one tool result. Steps 1–2 keep everything (pruning starts at step 3).
- **Fix:** Add `MAX_READ_LINES` (e.g., 500 lines). If file exceeds limit, return first 500 lines + message "File has N lines. Use startLine/endLine to read specific sections." For files >100 lines it already adds an outline — leverage that.
- **Impact:** Prevents single tool calls from consuming 5–10% of context window.

#### 2. `formatDoneResult()` dispatch output — UNBOUNDED
- **File:** `src/core/agents/subagent-tools.ts` (lines ~256-279)
- **Problem:** When a subagent calls `done()`, the formatted result has no character cap. A code agent that edited 10 files with verbose change descriptions can produce 20k+ chars. This entire result flows into main agent as a tool result in `coreMessages`.
- **Contrast:** Fallback results have caps (16k total, 4k per result). Done results don't.
- **Fix:** Enforce hard cap (e.g., 8k chars) on `formatDoneResult()` output. Truncate `keyFindings` and `changes` descriptions first.
- **Impact:** Prevents dispatch results from dominating context.

#### 3. Context window ratio hardcoded to 3 chars/token
- **File:** `useChat.ts` (line ~882)
- **Problem:** `contextBudgetChars = getModelContextWindow(activeModel) * 3`. Claude's actual ratio is 3.5–4 for code-heavy content. This means compaction triggers ~15-25% too late for code conversations — the model may already be degrading before compaction fires.
- **Fix:** Use 3.5 or 4 as the ratio. Or better: use actual `promptTokens` from the API response (available in `finish-step`) to calibrate the estimate.
- **Impact:** Prevents quality degradation in long code-heavy sessions.

### P1: Medium Impact

#### 4. Bus findings — unbounded growth
- **File:** `src/core/agents/agent-bus.ts` (line ~117)
- **Problem:** `findings: BusFinding[]` is append-only. Each agent posts findings during execution. These get injected into peer enrichment prompts. No eviction, no size cap. A 5-agent dispatch where each agent posts 10 findings = 50 findings growing the enrichment prompt.
- **Fix:** Cap at 20–30 findings total per dispatch, FIFO eviction. Or cap total findings chars at 4k.
- **Impact:** Prevents enrichment prompt bloat in complex dispatches.

#### 5. `navigate` output — no size limit
- **File:** `src/core/tools/navigate.ts`
- **Problem:** `workspace_symbols` can return hundreds of symbols. `references` for a common function can return 100+ locations. No truncation.
- **Fix:** Cap results at 30–50 items. Add "N more results, narrow your query" message.
- **Impact:** Prevents single navigate call from consuming 5k+ tokens.

#### 6. Steps 1–2 hold ALL tool results (no pruning)
- **Problem:** Level 1 pruning only kicks in at step 3+. If you dispatch + read large files in steps 1–2, those full results persist in context until compaction.
- **This is by design** (need recent results for coherent reasoning), but combined with unbounded read_file, it can waste 20-30k tokens.
- **Fix:** Fixing read_file (P0 #1) largely mitigates this. Alternatively, could start pruning at step 2 instead of 3.

#### 7. WSM decisions/discoveries — no per-list cap
- **File:** WorkingStateManager
- **Problem:** Tool result slots capped at 30 (FIFO), but decisions, discoveries, failures arrays have no limit. Long tasks can accumulate 50+ decisions.
- **Fix:** Cap each at 20–30 items, FIFO eviction.
- **Impact:** Prevents V2 compaction output from exceeding expected size.

### P2: Low Impact / Nice to Have

#### 8. Streaming char estimate never reconciled
- **File:** `useChat.ts` (line ~1288)
- **Problem:** `streamingCharsRef / 3` used for token estimation during streaming. Actual token counts only arrive at `finish-step`. No reconciliation.
- **Risk:** Minor — estimate is only used for progress display, not compaction triggering (which uses `coreChars`).
- **Fix:** Log discrepancy for monitoring. Low priority.

#### 9. System prompt injections accumulate per-step
- **File:** `step-utils.ts` (`buildPrepareStep`)
- **Problem:** Bus summary, task list, peer findings injected additively into system prompt. No dedup.
- **Risk:** Low in practice — these are small (100-500 chars each) and only injected when thresholds hit.
- **Fix:** Dedup or replace previous injections instead of appending.

#### 10. `analyze` tool output — no size limit
- **File:** `src/core/tools/analyze.ts`
- **Problem:** `diagnostics` action on a file with 200 errors returns all of them.
- **Fix:** Cap at 30 diagnostics with "+ N more" message.

#### 11. V2 compaction silent — no logging
- **Problem:** If user thinks V2 is active but config defaults to V1, there's no warning.
- **Fix:** Log active compaction strategy on first trigger.

---

## What's Working Well

- **Level 1 pruning** — well-designed per-tool summaries with symbol enrichment from repo map
- **Subagent prompts are lean** — removed repo map text + tool guidance duplication (~4-8k saved per agent)
- **Repo map fast-paths** — grep count mode, glob, navigate can resolve from in-memory index (0 API cost)
- **Shared file cache** — 50MB cap, mtime invalidation, prevents duplicate reads across dispatch agents
- **Tool result cache** — 200 slots, 120s TTL, deduplicates expensive operations
- **Memory index capped at ~800 chars** — bounded growth
- **Edit tools always preserved** — correct design, edits should never be pruned
- **Ephemeral Anthropic cache** — avoids re-processing static system prompt content
- **Search tools all bounded** — grep/glob/soul_grep/soul_find all have max result counts
- **Shell/project output truncated** — 16KB and 10KB caps prevent runaway command output
- **Post-dispatch evaluator** — typecheck only reports errors in edited files (filters noise)

---

## Key Constants Reference

| Constant | Value | File | Purpose |
|----------|-------|------|---------|
| KEEP_RECENT_MESSAGES | 4 | step-utils.ts | Rolling window for pruning |
| CONTEXT_TRIM (explore) | 50,000 | step-utils.ts | Inject bus summary |
| CONTEXT_TRIM (code) | 80,000 | step-utils.ts | Inject bus summary |
| BUDGET_WARNING (explore) | 60,000 | step-utils.ts | Warn agent |
| BUDGET_WARNING (code) | 120,000 | step-utils.ts | Warn agent |
| FORCE_DONE (explore) | 70,000 | step-utils.ts | Force completion |
| FORCE_DONE (code) | 135,000 | step-utils.ts | Force completion |
| MAX_CONCURRENT_AGENTS | 3 | subagent-tools.ts | Parallel dispatch limit |
| MAX_OUTPUT_BYTES (shell) | 16,384 | shell.ts | Shell output cap |
| MAX_OUTPUT (project) | 10,000 | project.ts | Project output cap |
| MAX_CONTENT_LENGTH (fetch) | 16,000 | fetch-page.ts | Web fetch cap |
| WSM tool result slots | 30 | working-state.ts | V2 compaction FIFO |
| Bus file cache | 50 MB | agent-bus.ts | Shared file cache |
| Bus tool cache | 200 slots | agent-bus.ts | Tool result dedup |
| Bus tool cache TTL | 120s | agent-bus.ts | Cache expiry |
| triggerThreshold | 0.7 | useChat.ts | Compaction trigger |
| resetThreshold | 0.4 | useChat.ts | Compaction reset |
| V1 output budget | 8,192 tokens | useChat.ts | Compaction LLM output |
| V2 gap-fill budget | 2,048 tokens | summarize.ts | V2 LLM output |
| Repo map cache TTL | 5s | manager.ts | Render cache |
| Memory index cap | ~800 chars | memory/manager.ts | System prompt section |
| grep maxCount | 50 | grep.ts | Match limit |
| glob max-results | 50 | glob.ts | File limit |
| soul_find default limit | 20 | soul-find.ts | Result limit |

---

## Recommended Fix Order

1. **Cap `read_file`** — biggest single token leak, easy fix
2. **Cap `formatDoneResult()`** — unbounded dispatch results
3. **Fix chars/token ratio** — 3 → 3.5 or calibrate from API
4. **Cap bus findings** — unbounded growth in dispatch
5. **Cap `navigate` output** — workspace_symbols/references
6. **Cap WSM lists** — decisions/discoveries/failures
7. **Cap `analyze` diagnostics** — large error lists
8. **Log compaction strategy** — V1 vs V2 visibility

---
---

# Speed Gap Analysis — Forge vs OpenCode

Date: 2026-03-14

Benchmark task: "What piece of the codebase can we refactor and reuse instead of duplicating?"
- Forge: ~4 minutes, ~40+ tool calls (7 list_dir + 1 dispatch + 6 read_code + 16 grep + 2 read_file + more grep)
- OpenCode: 3m17s, 1 dispatch → 77 tool calls inside subagent

---

## Why Forge Was ~30s Slower

### Root Cause: Sequential Main Agent Steps

Forge did ~30 sequential tool calls in the main agent (before AND after dispatching). Each tool call = 1 API roundtrip (~2s each). OpenCode dispatched immediately and let the subagent handle everything.

**Forge's trace breakdown:**
```
7 list_dir calls (pre-dispatch)     → 7 roundtrips = ~14s overhead
1 dispatch                          → parallel work (good)
6 read_code calls (post-dispatch)   → 6 roundtrips = ~12s overhead
16+ grep/soul_grep (post-dispatch)  → 16 roundtrips = ~32s overhead
2 read_file (post-dispatch)         → 2 roundtrips = ~4s overhead
                                      ≈ 62s of sequential overhead
```

OpenCode: 1 dispatch call → all 77 tool calls inside the subagent (no main agent overhead between them).

### 3 Architectural Causes

#### 1. Dispatch rejection forces pre-research

Validation in `subagent-tools.ts` (lines 862-882):
- `MAX_EXPLORE_FILES = 6` — auto-rejects explore dispatches with ≤6 unique files
- `MAX_CODE_FILES = 3` — auto-rejects code dispatches with ≤3 unique files
- Cache redundancy: rejects if ≥50% of target files already read

The agent can't dispatch for "find duplication" until it discovers 7+ relevant files. So it does 7 list_dir calls to understand structure, THEN dispatches.

#### 2. "Understand first" prompt creates sequential funnel

System prompt in `manager.ts` (lines 706-849):
```
"Scan [repo map] FIRST before any tool call"
"Research every file you'll touch using intelligence tools"
"Information priority — exhaust each level before escalating:
  1. Context (already in conversation)
  2. Codebase (existing patterns)
  3. URLs (fetch before searching)
  4. Web search (ONLY for gaps)"
```

This creates a mandatory sequential hierarchy: understand → plan → dispatch. OpenCode just dispatches.

#### 3. Each main-agent tool call = 1 API roundtrip

ToolLoopAgent processes one step at a time. AI SDK supports parallel tool calls IF the LLM emits multiple in one response, but the LLM rarely does for dependent calls. The 7 list_dir calls are 7 separate API roundtrips (~2s each = ~14s).

---

## ECC-Aligned Fixes (Without Breaking Existing Quality)

### Fix 1: Make `targetFiles` optional for explore-only dispatches

**Schema change — ECC pattern #1 (schema enforcement).**

- Explore = read-only, no file conflicts → safe to dispatch broadly
- Code = edits, file ownership matters → keep `targetFiles` required
- Skip file count validation when all tasks are explore + no targetFiles specified

This lets the agent dispatch "find duplication across the codebase" immediately without pre-research.

### Fix 2: Lower explore threshold 6→3

**Pure code change.** Still prevents trivial dispatches (1-2 files) but lets the agent dispatch sooner when it does specify files.

### Fix 3: Skip cache redundancy check for explore dispatches

**Code enforcement.** The "50% already cached → rejected" check forces sequential re-reading. For explore tasks, the shared bus file cache already handles dedup at execution time — the validation is redundant.

### Fix 4: Replace "information priority ladder" with assertive framing

**ECC pattern #2 (confident/assertive language).**

Current (sequential/negative):
```
Information priority — exhaust each level before escalating:
1. Context — previous results already in conversation
2. Codebase — existing patterns
3. URLs — fetch before searching
4. Web search — ONLY for specific gaps
```

Better (assertive/positive):
```
For broad codebase analysis, dispatch immediately — agents explore in parallel.
For targeted reads of known files, use tools directly.
Previous dispatch results and tool returns are already in your context — act on them.
```

### What NOT to Change

- `targetFiles` required for CODE dispatches — file ownership prevents edit conflicts (load-bearing ECC)
- Dispatch auto-merge — works well, no change needed
- Done tool contracts — demand rich output (ECC #4)
- Result richness caps — prevent re-reads (ECC #3)
- Repo map intercepts — zero-cost fast paths
- De-sloppify pass — separate concern (ECC #5)

---
---

# Research Quality Gap — Better Tools, Worse Results

Date: 2026-03-14

Benchmark task: "Find duplication and refactoring opportunities"
- Forge: 8 findings (missed biggest one — tool registration ~500 lines)
- OpenCode: 14 findings (caught tool registration + 5 others Forge missed)

---

## Results Comparison

### Shared Findings (both caught)

| Finding | Forge | OpenCode |
|---------|-------|----------|
| Forbidden path guard | 21+ files | 14+ files |
| Post-edit diagnostics pipeline | edit-file + multi-edit | Same |
| Agent factory duplication | explore.ts + code.ts | Same |
| Error result formatting | 30+ files | 35+ files |

### Forge Found, OpenCode Missed

| Finding | Files | Impact |
|---------|-------|--------|
| Popup layout boilerplate | 17 components | Big — usePopupLayout hook |
| Metric delta (already exported, not imported) | 1 file | Trivial |
| Nvim buffer sync after write | 3 files | Small |
| Intelligence router access pattern | 14 files | Medium |

### OpenCode Found, Forge Missed

| Finding | Files | Impact |
|---------|-------|--------|
| **Tool registration duplication (6 buildXTools)** | **index.ts** | **Massive — ~400-500 lines, repo-map intercept 8x** |
| TokenUsage type + ZERO_USAGE constant | 2 files | Small |
| ANTHROPIC_CACHE constant triplicated | 3 files | Trivial |
| Config deep-merge logic | 2 functions | Medium |
| Async-fetch hook pattern | 2 hooks | Medium |
| Spawn process pattern | 4 files | Medium |
| Enrichment timeout duplication | 2 files | Small |
| Editor tool spreading (...ternary 18x) | 3 functions | Small |
| formatToolArgs duplication | 2 files | Small |
| Config remove keys duplication | 2 functions | Small |

### Verdict

OpenCode found ~2x findings and caught the single biggest refactor (~500 lines). Forge's popup layout catch was good but smaller.

---

## Root Cause: Tool Bias Toward Precision Over Recall

### The Search Strategy Gap

**Forge's subagent + main agent follow-up:**
```
soul_grep "popupWidth = Math.min"     → finds popup pattern (lexical match)
soul_grep "readBufferContent"          → finds nvim pattern (lexical match)
soul_grep "isForbidden"               → finds forbidden pattern (lexical match)
grep "Overlay.*POPUP_BG"              → finds UI imports (lexical match)
read_code formatMetricDelta           → reads specific symbol (targeted)
read_code postEditDiagnostics         → reads specific symbol (targeted)
```

**OpenCode's subagent:**
```
read_file src/core/tools/index.ts     → reads ENTIRE file, sees 6 similar functions
read_file src/stores/statusbar.ts     → sees TokenUsage type
read_file src/hooks/useChat.ts        → sees same TokenUsage type duplicated
read_file src/core/agents/explore.ts  → reads full agent setup
read_file src/core/agents/code.ts     → reads full agent, notices structural similarity
read_file src/config/index.ts         → sees duplicated merge logic
```

Forge **grepped for patterns**. OpenCode **read files and let the LLM compare structure**.

### Why Our Better Tools Hurt Here

#### 1. Repo map creates false confidence

The agent sees the repo map listing `tools/index.ts — buildTools, buildRestrictedModeTools, buildSubagentExploreTools...` — those look like different functions with different purposes. You have to READ the file to see they're 90% identical. The repo map made the agent think it already understood the structure.

#### 2. soul_grep/grep bias toward lexical duplication

Our tools are optimized for "find this exact pattern." They find `isForbidden` (same string in 21 files) and `popupWidth = Math.min` (same expression in 17 files). But they fundamentally cannot find:

- "These two functions have the same shape but different variable names" (tool registration)
- "These two hooks follow the same async-fetch pattern" (useProviderModels vs useGroupedModels)
- "These four files all spawn a process the same way" (grep, soul-grep, glob, soul-find)

These are **structural** duplications, not **lexical** ones. Grep cannot detect them.

#### 3. read_code is too targeted for broad analysis

`read_code` reads a single symbol — perfect for "show me this function." But finding duplication requires reading a file and noticing "wait, this function looks like that other function." Broad context (read_file) beats surgical extraction (read_code) for discovery.

#### 4. Done tool contract penalizes breadth

"PASTE the actual code — descriptions like 'it uses a map' are useless." This makes the agent focus on FEWER findings with high-quality code evidence, rather than MORE findings with lighter descriptions. OpenCode listed 14 findings with brief descriptions. Forge listed 8 with code snippets.

### The Fundamental Gap

| Capability | Forge | OpenCode |
|-----------|-------|----------|
| "Where is X defined?" | Excellent (navigate, repo map) | Basic (grep) |
| "How many times is X used?" | Excellent (soul_grep count + repo map intercept) | Basic (grep -c) |
| "What depends on X?" | Excellent (soul_impact) | None |
| "Are these two functions similar?" | **Nothing** | **Nothing** (but reads files → LLM notices) |
| "Find all structural duplication" | **Nothing** | **Nothing** (but brute-force reading works) |

Our tooling is optimized for **precision** (find exactly X). The task needed **recall** (find everything duplicated). OpenCode won by doing the "dumb thing" — reading lots of files and letting the LLM's pattern recognition work. Our smart tools bypassed the LLM's ability to notice structural patterns.

---

## Fix: Structural Clone Detection (Long-Term, Language-Agnostic)

We already have tree-sitter parsing 14+ language families for the repo map. We extract symbols, signatures, dependencies. We throw away the one thing that catches structural duplication: **the shape of the AST itself.**

### Phase 1 — Shape Hashing (cheap, runs during repo map scan)

For every function/method body we already extract with tree-sitter:

1. Walk the AST, serialize **node types only** — strip all identifiers, literals, comments
2. Hash the normalized structure
3. Store in SQLite alongside existing symbol data

```sql
CREATE TABLE structural_clones (
  file TEXT,
  symbol TEXT,
  shape_hash TEXT,
  node_count INT
);
```

Two functions with the same `shape_hash` = identical control flow, identical nesting, identical statement structure — just different names and values.

**Catches:**
- `buildTools` / `buildRestrictedModeTools` / `buildSubagentExploreTools` (same shape: define schemas → register tools → wrap intercepts)
- `createExploreAgent` / `createCodeAgent` (same shape: setup bus → build tools → create agent)
- All 4 spawn-process patterns in grep/soul-grep/glob/soul-find

**Language-agnostic by definition** — tree-sitter node types are the universal representation. Works on TypeScript, Python, Rust, Go, C, Java — anything tree-sitter can parse.

**Cost:** Near zero. We already walk these ASTs during scan. Adding a hash is one extra pass over nodes we already visit. Stored in the same SQLite db.

### Phase 2 — Token Sequence Similarity (near-duplicates)

Shape hashing catches exact structural clones. Copy-paste-then-modify creates **near-clones** — same shape with a few extra lines or one added branch.

1. For each function body, extract tree-sitter tokens
2. Normalize: identifiers → `$ID`, string literals → `$STR`, numbers → `$NUM`
3. Compute MinHash signature (k-shingles of normalized tokens)
4. Store compact signature (~128 bytes per function)

```sql
CREATE TABLE token_signatures (
  file TEXT,
  symbol TEXT,
  minhash BLOB  -- 128 bytes, compact
);
```

Query: for a given function, find all functions with Jaccard similarity > 0.7.

**Catches:**
- Popup layout boilerplate (17 components with ~92% token overlap)
- Post-edit diagnostics pipeline (near-identical with minor variations)
- Config deep-merge (same pattern, different field names)
- Async-fetch hooks (same structure, different data types)

**Cost:** Moderate compute during scan, compact storage. MinHash comparison is O(1) per pair.

### Phase 3 — Cross-Function Fragment Detection

Phases 1-2 compare whole functions. Some duplication is **fragments** — the same 10-line pattern repeated inside otherwise different functions (like the `isForbidden` guard in 21 files).

1. Sliding window over normalized token sequences (Rabin-Karp rolling hash)
2. Find repeated subsequences above a threshold length (e.g., 5+ statements)
3. Group by location → "this 8-line pattern appears in 21 files"

Heavier compute, runs as background job after scan completes. Not blocking.

### How It Surfaces

New action on existing `soul_analyze` tool:

```
soul_analyze duplication              → top clusters across repo
soul_analyze duplication file=foo.ts  → clones of functions in this file
soul_analyze duplication symbol=bar   → what looks like this function
```

Example output:
```
Structural clones (exact shape match):
  Cluster A — 6 functions, 85% avg similarity
    buildTools (index.ts:86)
    buildRestrictedModeTools (index.ts:728)
    buildSubagentExploreTools (index.ts:965)
    buildSubagentCodeTools (index.ts:1234)
    buildRestrictedTools (index.ts:1350)
    buildPlanModeTools (index.ts:1420)
    Pattern: tool selection + schema definition + intercept wrapping

  Cluster B — 2 functions, 100% shape match
    createExploreAgent (explore.ts:60)
    createCodeAgent (code.ts:62)
    Pattern: bus setup → build tools → wrap cache → create ToolLoopAgent

Near-duplicates (>70% token similarity):
  Cluster C — 17 functions, 92% avg similarity
    GitMenu (git-menu.tsx:12)
    LlmSelector (llm-selector.tsx:8)
    HelpPopup (help-popup.tsx:15)
    ... (14 more)
    Common tokens: Math.min(MAX_POPUP_WIDTH, Math.floor(termCols * ...))

Repeated fragments (>5 statements, Phase 3):
  Fragment D — 21 occurrences
    Pattern: isForbidden() check → error result return
    Files: read-file.ts:42, edit-file.ts:38, shell.ts:55, ...

  Fragment E — 4 occurrences
    Pattern: Bun.spawn(["rg", ...]) → collect chunks → handle close/error
    Files: grep.ts:45, soul-grep.ts:120, glob.ts:30, soul-find.ts:88
```

### Why This Is ECC-Aligned

- **Code enforcement, not prompt instructions** — the tool discovers duplication through computation, not by asking the LLM to notice it
- **Schema-level** — new action on existing tool, validated by Zod
- **Confident output** — returns concrete clusters with file:line references, not "you might want to check..."
- **Language-agnostic** — tree-sitter handles parsing, shape hashing handles comparison. Works on all 14+ language families we already support
- **Builds on existing infrastructure** — repo map scan, SQLite storage, tree-sitter grammars, symbol extraction. No new dependencies

### What This Changes for the Benchmark

For the "find duplication" task, the agent calls `soul_analyze duplication` as its **first tool call**. One call, instant result from SQLite, zero LLM-driven file reading needed. The 77 file reads OpenCode did and the 40+ tool calls Forge did both collapse to:

1. `soul_analyze duplication` → instant clusters from SQLite
2. 3-5 `read_code` calls to inspect the most interesting clusters
3. Done

~30 seconds total instead of 3-4 minutes. And better results than either tool achieved.

### Implementation Effort

| Phase | Effort | What It Catches | Dependencies |
|-------|--------|----------------|--------------|
| Phase 1 (shape hash) | Small | Exact structural clones | Extends existing tree-sitter scan |
| Phase 2 (MinHash) | Medium | Near-clones, copy-paste-modify | New computation, compact storage |
| Phase 3 (fragments) | Larger | Repeated snippets within different functions | Rolling hash, background job |

Phase 1 alone would have caught OpenCode's biggest finding (tool registration, ~500 lines). Phase 1+2 catches everything both tools found. Phase 3 is completionist.

---

## Summary — All Fixes

### Immediate (Token Leaks)

1. Cap `read_file` output (500 lines)
2. Cap `formatDoneResult()` (8k chars)
3. Fix chars/token ratio (3 → 3.5 or calibrate)
4. Cap bus findings (20-30, FIFO)
5. Cap `navigate` output (30-50 items)
6. Cap WSM lists (20-30 per list)
7. Cap `analyze` diagnostics (30 items)
8. Log compaction strategy

### Speed (Dispatch Behavior)

1. Make `targetFiles` optional for explore-only dispatches (schema change)
2. Lower explore threshold 6→3 (code change)
3. Skip cache redundancy for explore dispatches (code change)
4. Replace "information priority ladder" with assertive dispatch framing (prompt)

### Research Quality (Structural Clone Detection)

1. Phase 1: Shape hashing during repo map scan (small effort, biggest impact)
2. Phase 2: MinHash token similarity (medium effort)
3. Phase 3: Cross-function fragment detection (larger effort)
4. Expose via `soul_analyze duplication` action
