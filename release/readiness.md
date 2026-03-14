# SoulForge Release Readiness

Audit date: 2026-03-14

## Scores

| Area | Score | Notes |
|------|-------|-------|
| Production readiness | 9/10 | DB timeouts fixed, atomic writes, large file handling |
| Open-source readiness | 95%+ | All docs complete, no secrets, AGPL licensed |
| Competitive position | Strong niche | Only terminal IDE with embedded editor + deep intelligence + multi-agent |

## Inventory

- 32 tools, 50+ components, 15 hooks, 5 agent types, 9 LLM providers, 5 forge modes
- 1,196 tests passing, 26 test files
- TypeScript strict, Biome linted, AGPL-3.0

## Competitive Position

### Unique Combination (No Competitor Has All Three)

1. Embedded real Neovim with LSP in the same terminal
2. Graph-powered repo map (PageRank + cochange + blast radius + clone detection)
3. Multi-agent dispatch with shared cache, tier routing, desloppify pass

### Key Advantages by Competitor

| Competitor | SoulForge Advantage | Their Advantage |
|---|---|---|
| Claude Code | Multi-provider, embedded editor, compound tools, repo map graphs | MCP ecosystem, cloud agents, enterprise, community |
| Cursor | Terminal-native (SSH/tmux), no subscription, deeper analysis | GUI polish, tab autocomplete, inline suggestions |
| Aider | Embedded editor, richer repo map, multi-agent parallelism | Simpler setup, auto-commit, auto-lint/test, larger community |
| Copilot CLI | Embedded editor, repo map, compound refactoring, open source | Cloud background agents, GitHub ecosystem, easier install |
| Windsurf | Open source, no vendor lock-in, deeper intelligence | GUI, tab autocomplete, enterprise features |
| Zed | Terminal-native, repo map analytics, multi-agent dispatch | Native 120fps GUI, multiplayer, edit prediction |

### Biggest Competitive Gaps

1. No tab/autocomplete — table stakes for many devs
2. No MCP protocol — Claude Code's integration moat
3. No cloud/background agents — can't delegate and walk away
4. High setup friction — requires Bun + Neovim
5. No plugin/skill ecosystem
6. Small community — no social proof

### Target Audiences

- Vim/terminal power users wanting AI without leaving their workflow
- Multi-provider / cost-conscious devs (task routing, BYOK, no subscription)
- Large codebase devs (graph intelligence, parallel agents, shared cache)

---

## Batch 1: Critical Fixes

- [x] Fix useMemo after early return in MessageList.tsx (Rules of Hooks violation)
- [x] Add busy_timeout to Memory DB (was unset — deadlock risk)
- [x] Add busy_timeout to History DB (was unset — deadlock risk)
- [x] Bump RepoMap busy_timeout 100ms → 5000ms
- [x] Fix non-null assertions in multi-edit.ts and edit-stack.ts
- [x] Fix 2 failing step-utils tests (behavior changed, tests not updated)
- [x] Fix ProviderSettings useEffect lint warning

## Batch 2: Open-Source Polish

- [x] Add SECURITY.md (responsible disclosure)
- [x] Add CHANGELOG.md
- [x] Add CI badges to README (tests, typecheck)
- [x] Add CODE_OF_CONDUCT.md
- [x] Finish README.md (Usage, Configuration, Contributing, License sections)

## Batch 3: Production Hardening

- [x] Atomic session writes (temp file + rename)
- [x] File size validation before reads (>50MB auto-truncates with helpful message)
- [x] Bound streamErrors array length (capped at 50)
- [x] Session manager tests (13 tests: round-trip, corruption, truncation, multi-tab, listing)
- [x] Read-file tests (9 tests: basic, ranges, 500-line cap, >50MB truncation, errors)

## Batch 4: Competitive Moat

- [ ] MCP protocol support
- [ ] Plugin/skill system
- [ ] Tab autocomplete
- [ ] Cloud/background agents
- [ ] Orchestrated workflows (planner → TDD → implementer → reviewer)

## Production Readiness Details

### What's Solid

- Error recovery with exponential backoff (429, 503, rate limits)
- 2-level provider option degradation
- Crash-resilient session saves (incremental every 10s + exit handler)
- Streaming UI batched at 150ms
- SQLite WAL mode for concurrent reads
- 4-tier intelligence fallback
- Forbidden file enforcement across all tools
- Outside-cwd confirmation for writes
- Shell anti-pattern blocking

### Known Edge Cases

| Edge Case | Status |
|-----------|--------|
| Very large codebases (10k+ files) | Risk — no pagination on repo map queries |
| No internet | Handled — web search blocked, tools return errors |
| Invalid config | Handled — falls back to defaults |
| Corrupted session files | Partial — JSON parse fails → null, no recovery |
| Missing .git | Handled — git context optional |
| Readonly filesystem | Fail — writeFileSync will crash |
| Database locked (concurrent) | Fixed — busy_timeout now set on all DBs |
| Model context exceeded | Handled — auto-compaction at 70% |
| Provider rate limit 429 | Handled — exponential backoff |

### Cross-Platform

- macOS: fully supported (arm64 + x64)
- Linux: supported (x64 + arm64)
- Windows: not supported (no binary, no path normalization)

### Testing Gaps

- No integration tests (full agent loop)
- No concurrency tests (parallel agents)
- No session corruption recovery tests
- No cross-platform tests
- No network failure tests

## Open-Source Readiness Details

### Green Lights

- No secrets in source — all API keys from env vars
- License: AGPL-3.0 with full text
- CONTRIBUTING.md and GETTING_STARTED.md exist
- No personal paths in source
- No debug logging in production
- Clean dependency tree — all public packages
- Comprehensive .gitignore
- Secret storage uses keychain or 0o600 permissions

### Needs Attention

- CLAUDE.md contains internal dev notes — review before public release
