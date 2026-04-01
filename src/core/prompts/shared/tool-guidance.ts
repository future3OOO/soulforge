/**
 * Shared tool guidance — appended to every family prompt.
 * Tool descriptions carry [TIER-N] labels. This block teaches the decision flow.
 */

export const TOOL_GUIDANCE_WITH_MAP = `# Tool usage
A Soul Map is loaded in context — every file, exported symbol, signature, line number, and dependency.

## Decision flow
1. Check the Soul Map FIRST — it answers "where is X?", "what does Y export?", "what depends on Z?" without any tool call.
2. Use TIER-1 tools by default. Only drop to TIER-2/3 when TIER-1 cannot answer the question.
3. Read precise line ranges using Soul Map line numbers — e.g. read_file(path, startLine: 45, endLine: 80) for a specific function. soul_grep results also give exact lines — use them.
4. Before editing a file with blast radius (→N) > 10, call soul_impact to check dependents and cochanges. Cochanges reveal files that historically change together — you may need to update them too.
5. To find a symbol's definition or callers, use navigate — it auto-resolves the file from the symbol name.
6. To search code, use soul_grep — it has repo-map interception and symbol context.
7. Use navigate(symbols, file) or navigate(definition) to inspect dependency types — e.g. node_modules (*.d.ts), *.pyi stubs, *.rbi, C/C++ headers, *.java in jars. LSP resolves inheritance chains automatically and shows all members including inherited ones in one call.
8. When editing, always provide lineStart from your read_file output — the range is derived from oldString line count. This is the most reliable edit method.
9. After every edit, call project (typecheck/test) to verify.
10. Batch ALL independent reads/searches in one parallel call. Never read the same file twice.
11. Use multi_edit for multiple changes to the same file — it's atomic and runs diagnostics once.
Each tool call round-trip resends the full conversation — every extra round costs thousands of tokens.

## navigate is your LSP — use it
navigate is backed by a standalone LSP server that is always running. It works across your project and into dependency files (node_modules/*.d.ts, vendor, stubs). Use it for:
- navigate(definition, symbol="X") — jump to where X is defined, even in dependencies
- navigate(references, symbol="X") — find all usages of X across the codebase
- navigate(call_hierarchy, symbol="X") — see what calls X and what X calls
- navigate(implementation, symbol="X") — find concrete implementations of interfaces
- navigate(type_hierarchy, symbol="X") — see inheritance chains
- navigate(symbols, file="path") — list all symbols in a file with their types and lines
File is auto-resolved from the symbol name — just pass the symbol.

## Use dedicated tools, not shell
- Read files: read_file (works on any file — node_modules, .d.ts, vendor, headers)
- Search code: soul_grep (dep param searches inside node_modules/vendor)
- Find files: list_dir, soul_find
- Definitions & types: navigate(definition) — resolves into dependency .d.ts files automatically
- References & callers: navigate(references), navigate(call_hierarchy)
- Edit files: edit_file, multi_edit
- Verify changes: project (typecheck/lint/test)
- Use absolute paths. Avoid cd in shell commands.
Shell is for git operations, package installs, and system commands only.`;

export const TOOL_GUIDANCE_NO_MAP = `# Tool usage
If you intend to call multiple tools with no dependencies between them, make all independent calls in the same block.
Each tool call round-trip resends the entire conversation — minimize the number of steps.`;
