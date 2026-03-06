import { homedir } from "node:os";
import { join } from "node:path";
import type { BoxRenderable, InputRenderable, ScrollBoxRenderable } from "@opentui/core";
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HistoryDB } from "../core/history/db.js";
import { type FuzzyMatch, fuzzyFilter, fuzzyMatch } from "../core/history/fuzzy.js";
import { icon } from "../core/icons.js";

const FORGE_STATUSES = [
  "Forging response…",
  "Stoking the flames…",
  "Summoning spirits…",
  "Channeling the ether…",
  "Tempering thoughts…",
  "Conjuring words…",
  "Consulting the runes…",
  "Weaving spellwork…",
  "Kindling the forge…",
  "Gathering arcana…",
];

const _ghostIcon = () => icon("ghost");
const GHOST_FRAMES = [_ghostIcon, _ghostIcon, _ghostIcon, () => " "] as const;
const GHOST_SPEED = 400;

interface Props {
  onSubmit: (value: string) => void;
  isLoading: boolean;
  isFocused?: boolean;
  onQueue?: (msg: string) => void;
  queueCount?: number;
  cwd?: string;
}

const CMD_DEFS: Array<{ cmd: string; ic: string; desc: string }> = [
  { cmd: "/branch", ic: "git", desc: "Show/create branch" },
  { cmd: "/changes", ic: "changes", desc: "Toggle changed files tree" },
  { cmd: "/chat-style", ic: "chat", desc: "Toggle chat layout style" },
  { cmd: "/clear", ic: "clear", desc: "Clear chat history" },
  { cmd: "/close-tab", ic: "tabs", desc: "Close current tab (Alt+W)" },
  { cmd: "/co-author-commits", ic: "git", desc: "Toggle co-author trailer" },
  { cmd: "/commit", ic: "git", desc: "AI-assisted git commit" },
  { cmd: "/compact", ic: "compress", desc: "Compact conversation context" },
  { cmd: "/context", ic: "context", desc: "Show/clear context budget" },
  { cmd: "/continue", ic: "play", desc: "Continue interrupted generation" },
  { cmd: "/diff", ic: "git", desc: "Open diff in editor" },
  { cmd: "/diff-style", ic: "git", desc: "Change diff display style" },
  { cmd: "/editor", ic: "pencil", desc: "Toggle editor panel" },
  { cmd: "/editor-settings", ic: "cog", desc: "Toggle editor/LSP integrations" },
  { cmd: "/errors", ic: "error", desc: "Browse error log" },
  { cmd: "/font", ic: "pencil", desc: "Show/set terminal font" },
  { cmd: "/git", ic: "git", desc: "Git menu" },
  { cmd: "/help", ic: "help", desc: "Show available commands" },
  { cmd: "/init", ic: "git", desc: "Initialize git repo" },
  { cmd: "/lazygit", ic: "git", desc: "Launch lazygit" },
  { cmd: "/log", ic: "git", desc: "Show recent commits" },
  { cmd: "/memory", ic: "memory", desc: "Manage memory scopes, view & clear" },
  { cmd: "/mode", ic: "cog", desc: "Switch forge mode" },
  { cmd: "/nerd-font", ic: "ghost", desc: "Toggle Nerd Font icons" },
  { cmd: "/new-tab", ic: "tabs", desc: "Open new tab (Alt+T)" },
  { cmd: "/nvim-config", ic: "pencil", desc: "Switch neovim config mode" },
  { cmd: "/open", ic: "changes", desc: "Open file in editor" },
  { cmd: "/panel", ic: "panel", desc: "Toggle side panel" },
  { cmd: "/plan", ic: "plan", desc: "Toggle plan mode (research & plan only)" },
  { cmd: "/privacy", ic: "lock", desc: "Manage forbidden file patterns" },
  { cmd: "/provider-settings", ic: "system", desc: "Thinking, effort, speed, context mgmt" },
  { cmd: "/proxy", ic: "proxy", desc: "Proxy status" },
  { cmd: "/proxy install", ic: "proxy", desc: "Install CLIProxyAPI" },
  { cmd: "/proxy login", ic: "proxy", desc: "Authenticate with Claude" },
  { cmd: "/pull", ic: "git", desc: "Pull from remote" },
  { cmd: "/push", ic: "git", desc: "Push to remote" },
  { cmd: "/quit", ic: "quit", desc: "Exit SoulForge" },
  { cmd: "/reasoning", ic: "brain", desc: "Show or hide reasoning content" },
  { cmd: "/rename", ic: "pencil", desc: "Rename current tab" },
  { cmd: "/repo-map", ic: "tree", desc: "Repo map settings (AST index)" },
  { cmd: "/restart", ic: "ghost", desc: "Full restart" },
  { cmd: "/router", ic: "router", desc: "Assign models per task type" },
  { cmd: "/sessions", ic: "clock_alt", desc: "Browse & restore sessions" },
  { cmd: "/setup", ic: "ghost", desc: "Check & install prerequisites" },
  { cmd: "/skills", ic: "skills", desc: "Browse & install skills" },
  { cmd: "/stash", ic: "git", desc: "Stash changes" },
  { cmd: "/stash pop", ic: "git", desc: "Pop latest stash" },
  { cmd: "/status", ic: "git", desc: "Git status" },
  { cmd: "/storage", ic: "system", desc: "View & manage storage usage" },
  { cmd: "/summarize", ic: "compress", desc: "Compact conversation context" },
  { cmd: "/tabs", ic: "tabs", desc: "List open tabs" },
  { cmd: "/verbose", ic: "cog", desc: "Toggle verbose tool output" },
  { cmd: "/vim-hints", ic: "pencil", desc: "Toggle vim keybinding hints" },
  { cmd: "/web-search", ic: "cog", desc: "Web search keys & settings" },
];

let _commands: Array<{ cmd: string; icon: string; desc: string }> | null = null;
function getCommands() {
  if (!_commands) {
    _commands = CMD_DEFS.map((c) => ({ cmd: c.cmd, icon: icon(c.ic), desc: c.desc }));
  }
  return _commands;
}

const HighlightedText = memo(function HighlightedText({
  text,
  indices,
}: {
  text: string;
  indices: number[];
}) {
  if (indices.length === 0) return <text fg="#ccc">{text}</text>;
  const indexSet = new Set(indices);
  const spans: { text: string; hl: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    const hl = indexSet.has(i);
    const last = spans[spans.length - 1];
    if (last && last.hl === hl) {
      last.text += char;
    } else {
      spans.push({ text: char, hl });
    }
  }
  return (
    <text>
      {spans.map((s, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: stable span order
          key={i}
          fg={s.hl ? "#FF0040" : "#ccc"}
          attributes={s.hl ? TextAttributes.BOLD : undefined}
        >
          {s.text}
        </span>
      ))}
    </text>
  );
});

/** Wrap a string into visual rows of `width` characters. */
function wrapText(text: string, width: number): string[] {
  if (width <= 0 || text.length <= width) return [text];
  const rows: string[] = [];
  for (let i = 0; i < text.length; i += width) {
    rows.push(text.slice(i, i + width));
  }
  return rows.length > 0 ? rows : [""];
}

/** Rendered visual rows for the entire multiline buffer with wrapping. */
interface VisualRow {
  text: string;
  lineIdx: number;
  wrapIdx: number;
  isLastWrap: boolean;
}

function buildVisualRows(lines: string[], width: number): VisualRow[] {
  const rows: VisualRow[] = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li] ?? "";
    const wrapped = wrapText(line, width);
    for (let wi = 0; wi < wrapped.length; wi++) {
      rows.push({
        text: wrapped[wi] ?? "",
        lineIdx: li,
        wrapIdx: wi,
        isLastWrap: wi === wrapped.length - 1,
      });
    }
  }
  return rows;
}

export function InputBox({ onSubmit, isLoading, isFocused, onQueue, queueCount, cwd }: Props) {
  const [value, setValue] = useState("");
  const valueRef = useRef(value);
  valueRef.current = value;
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [inputKey, setInputKey] = useState(0);
  const { height: termRows, width: termWidth } = useTerminalDimensions();
  const acScrollRef = useRef<ScrollBoxRenderable>(null);
  const inputRef = useRef<InputRenderable>(null);
  const containerRef = useRef<BoxRenderable>(null);
  const [cursorLine, setCursorLine] = useState(0);
  const [pasteCollapsed, setPasteCollapsed] = useState(false);

  const [ghostTick, setGhostTick] = useState(0);
  const forgeStatusRef = useRef("");
  const wasLoadingRef = useRef(false);
  if (isLoading && !wasLoadingRef.current) {
    forgeStatusRef.current = FORGE_STATUSES[
      Math.floor(Math.random() * FORGE_STATUSES.length)
    ] as string;
  }
  wasLoadingRef.current = isLoading;

  useEffect(() => {
    if (!isLoading) return;
    const timer = setInterval(() => setGhostTick((t) => t + 1), GHOST_SPEED);
    return () => clearInterval(timer);
  }, [isLoading]);

  const ghostFrameFn = GHOST_FRAMES[ghostTick % GHOST_FRAMES.length];
  const currentGhost = ghostFrameFn ? ghostFrameFn() : " ";

  const historyDBRef = useRef<HistoryDB | null>(null);
  const historyCacheRef = useRef<string[]>([]);
  const historyIdx = useRef(-1);
  const historyStash = useRef("");

  const getHistoryDB = useCallback(() => {
    if (!historyDBRef.current) {
      historyDBRef.current = new HistoryDB(join(homedir(), ".soulforge", "history.db"));
    }
    return historyDBRef.current;
  }, []);

  const refreshHistoryCache = useCallback(() => {
    try {
      historyCacheRef.current = getHistoryDB().recent(100);
    } catch {
      historyCacheRef.current = [];
    }
  }, [getHistoryDB]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: one-time init + cleanup
  useEffect(() => {
    refreshHistoryCache();
    return () => {
      historyDBRef.current?.close();
      historyDBRef.current = null;
    };
  }, []);

  const [fuzzyMode, setFuzzyMode] = useState(false);
  const [fuzzyQuery, setFuzzyQuery] = useState("");
  const [fuzzyResults, setFuzzyResults] = useState<FuzzyMatch[]>([]);
  const [fuzzyCursor, setFuzzyCursor] = useState(0);
  const fuzzyScrollRef = useRef<ScrollBoxRenderable>(null);
  const fuzzyScrollOffset = useRef(0);

  useEffect(() => {
    if (!fuzzyMode) return;
    try {
      const candidates = getHistoryDB().recent(500);
      setFuzzyResults(fuzzyFilter(fuzzyQuery, candidates, 50));
      setFuzzyCursor(0);
      fuzzyScrollOffset.current = 0;
      fuzzyScrollRef.current?.scrollTo(0);
    } catch {
      setFuzzyResults([]);
    }
  }, [fuzzyQuery, fuzzyMode, getHistoryDB]);

  const focused = isFocused ?? true;

  const showAutocomplete = value.startsWith("/") && focused && !fuzzyMode;
  const query = value.toLowerCase();
  const matches = useMemo(() => {
    if (!showAutocomplete) return [];
    const cmds = getCommands();
    const results: Array<{
      cmd: string;
      icon: string;
      desc: string;
      score: number;
      indices: number[];
    }> = [];
    for (const c of cmds) {
      const m = fuzzyMatch(query, c.cmd);
      if (m) results.push({ ...c, score: m.score, indices: m.indices });
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }, [showAutocomplete, query]);
  const hasMatches = matches.length > 0 && value !== matches[0]?.cmd;

  const ghost =
    hasMatches && matches[selectedIdx]?.cmd.startsWith(query)
      ? matches[selectedIdx].cmd.slice(value.length)
      : "";

  const maxVisible = Math.max(5, Math.floor(termRows * 0.7));
  const acScrollOffset = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset selection when input changes
  useEffect(() => {
    setSelectedIdx(0);
    acScrollOffset.current = 0;
    acScrollRef.current?.scrollTo(0);
  }, [value]);

  useEffect(() => {
    if (!hasMatches) return;
    const offset = acScrollOffset.current;
    if (selectedIdx < offset) {
      acScrollOffset.current = selectedIdx;
      acScrollRef.current?.scrollTo(selectedIdx);
    } else if (selectedIdx >= offset + maxVisible) {
      const newOffset = selectedIdx - maxVisible + 1;
      acScrollOffset.current = newOffset;
      acScrollRef.current?.scrollTo(newOffset);
    }
  }, [selectedIdx, hasMatches, maxVisible]);

  const acceptCompletion = useCallback(() => {
    const completed = matches[selectedIdx]?.cmd;
    if (!completed) return;
    setValue(completed);
    setInputKey((k) => k + 1);
  }, [matches, selectedIdx]);

  const insertNewline = useCallback(() => {
    setPasteCollapsed(false);
    setValue((prev) => {
      const lines = prev.split("\n");
      lines.splice(cursorLine + 1, 0, "");
      return lines.join("\n");
    });
    setCursorLine((prev) => prev + 1);
    setInputKey((k) => k + 1);
  }, [cursorLine]);

  const handleChange = useCallback((newValue: string) => {
    historyIdx.current = -1;
    const oldLineCount = valueRef.current.split("\n").length;
    const newLineCount = newValue.split("\n").length;
    if (newLineCount - oldLineCount > 1 && newLineCount > 2) {
      setPasteCollapsed(true);
    }
    setValue(newValue);
  }, []);

  const pushHistory = useCallback(
    (input: string) => {
      try {
        getHistoryDB().push(input, cwd);
        refreshHistoryCache();
      } catch {}
    },
    [getHistoryDB, refreshHistoryCache, cwd],
  );

  const resetInput = useCallback(() => {
    setValue("");
    setCursorLine(0);
    setPasteCollapsed(false);
    historyIdx.current = -1;
    setInputKey((k) => k + 1);
  }, []);

  const handleSubmit = (input: string) => {
    // Autocomplete match — complete or submit the command
    if (hasMatches && matches[selectedIdx]) {
      const completed = matches[selectedIdx].cmd;
      if (completed === "/open" || completed === "/branch") {
        setValue(`${completed} `);
        setInputKey((k) => k + 1);
      } else {
        pushHistory(completed);
        onSubmit(completed);
        resetInput();
      }
      return;
    }

    if (input.trim() === "") return;

    // During loading: slash commands execute immediately, messages queue
    if (isLoading && !input.trim().startsWith("/")) {
      onQueue?.(input.trim());
      resetInput();
      return;
    }

    pushHistory(input.trim());
    onSubmit(input.trim());
    resetInput();
  };

  // Compute available width for text content (inside border + padding)
  const measuredWidth = containerRef.current?.width ?? 0;
  const contentWidth = useMemo(
    () => Math.max(10, (measuredWidth > 0 ? measuredWidth - 4 : termWidth - 6) - 2),
    [measuredWidth, termWidth],
  );

  // Build visual rows for display
  const lines = useMemo(() => value.split("\n"), [value]);
  const isMultiline = lines.length > 1;
  const visualRows = useMemo(() => buildVisualRows(lines, contentWidth), [lines, contentWidth]);

  // Find which visual row the active input sits on (last wrap of cursorLine)
  const activeVisualIdx = useMemo(() => {
    for (let i = visualRows.length - 1; i >= 0; i--) {
      if (visualRows[i]?.lineIdx === cursorLine && visualRows[i]?.isLastWrap) return i;
    }
    return visualRows.length - 1;
  }, [visualRows, cursorLine]);

  useKeyboard((evt) => {
    // ── Autocomplete navigation ──
    if (hasMatches) {
      if (evt.name === "down") {
        setSelectedIdx((prev) => (prev + 1) % matches.length);
        evt.preventDefault();
        return;
      }
      if (evt.name === "up") {
        setSelectedIdx((prev) => (prev > 0 ? prev - 1 : matches.length - 1));
        evt.preventDefault();
        return;
      }
      if ((evt.name === "tab" || evt.name === "right") && ghost) {
        acceptCompletion();
        evt.preventDefault();
        return;
      }
    }

    // ── Ctrl+R: toggle fuzzy history search ──
    if (focused) {
      if (evt.ctrl && evt.name === "r") {
        setFuzzyMode((prev) => !prev);
        setFuzzyQuery("");
        evt.preventDefault();
        return;
      }
    }

    // ── Fuzzy mode key handling ──
    if (fuzzyMode) {
      if (evt.name === "escape") {
        setFuzzyMode(false);
        setFuzzyQuery("");
        evt.preventDefault();
        return;
      }
      if (evt.name === "return") {
        const selected = fuzzyResults[fuzzyCursor];
        if (selected) {
          setValue(selected.entry);
          setCursorLine(0);
          setInputKey((k) => k + 1);
        }
        setFuzzyMode(false);
        setFuzzyQuery("");
        evt.preventDefault();
        return;
      }
      if (evt.name === "up") {
        setFuzzyCursor((prev) => (prev > 0 ? prev - 1 : Math.max(0, fuzzyResults.length - 1)));
        evt.preventDefault();
        return;
      }
      if (evt.name === "down") {
        setFuzzyCursor((prev) => (prev + 1) % Math.max(1, fuzzyResults.length));
        evt.preventDefault();
        return;
      }
      if (evt.name === "backspace" || evt.name === "delete") {
        setFuzzyQuery((prev) => prev.slice(0, -1));
        evt.preventDefault();
        return;
      }
      if (evt.ctrl || evt.meta || evt.name === "tab") return;
      if (evt.name && evt.name.length === 1) {
        setFuzzyQuery((prev) => prev + evt.name);
        evt.preventDefault();
        return;
      }
      return;
    }

    // ── Expand collapsed paste on up/down arrow ──
    if (focused && pasteCollapsed && (evt.name === "up" || evt.name === "down")) {
      setPasteCollapsed(false);
      evt.preventDefault();
      return;
    }

    // ── Shift+Enter / Meta+Enter — insert newline ──
    // Terminals send linefeed (\n) for Shift+Enter, not return (\r)
    if (
      focused &&
      (evt.name === "linefeed" || (evt.name === "return" && (evt.shift || evt.meta)))
    ) {
      insertNewline();
      evt.preventDefault();
      return;
    }

    // ── Normal editing mode ──
    if (!focused || hasMatches || fuzzyMode) return;

    const currentLines = valueRef.current.split("\n");
    const multiline = currentLines.length > 1;

    // Ctrl+U — clear line (single-line: clear all; multiline: delete current line)
    if (evt.ctrl && evt.name === "u") {
      if (!multiline) {
        resetInput();
      } else {
        const updated = [...currentLines];
        updated.splice(cursorLine, 1);
        if (updated.length === 0) {
          resetInput();
        } else {
          const newCursor = Math.min(cursorLine, updated.length - 1);
          setValue(updated.join("\n"));
          setCursorLine(newCursor);
          setInputKey((k) => k + 1);
        }
      }
      evt.preventDefault();
      return;
    }

    // Ctrl+W — delete word backward
    if (evt.ctrl && evt.name === "w") {
      const curLine = currentLines[cursorLine] ?? "";
      const offset = inputRef.current?.cursorOffset ?? curLine.length;
      const before = curLine.slice(0, offset);
      const after = curLine.slice(offset);
      // Delete trailing spaces, then word chars
      const trimmed = before.replace(/\s+$/, "");
      const wordRemoved = trimmed.replace(/[^\s]+$/, "");
      const updated = [...currentLines];
      updated[cursorLine] = wordRemoved + after;
      setValue(updated.join("\n"));
      setInputKey((k) => k + 1);
      evt.preventDefault();
      return;
    }

    // Ctrl+A — move cursor to start of line
    if (evt.ctrl && evt.name === "a") {
      // Remount input to reset cursor to position 0
      setInputKey((k) => k + 1);
      evt.preventDefault();
      return;
    }

    // Ctrl+K — delete from cursor to end of line
    if (evt.ctrl && evt.name === "k") {
      const curLine = currentLines[cursorLine] ?? "";
      const offset = inputRef.current?.cursorOffset ?? curLine.length;
      const updated = [...currentLines];
      updated[cursorLine] = curLine.slice(0, offset);
      setValue(updated.join("\n"));
      setInputKey((k) => k + 1);
      evt.preventDefault();
      return;
    }

    // Up arrow
    if (evt.name === "up") {
      if (multiline && cursorLine > 0) {
        setCursorLine((prev) => prev - 1);
        setInputKey((k) => k + 1);
        evt.preventDefault();
        return;
      }
      // History navigation
      const history = historyCacheRef.current;
      if (history.length === 0) return;
      if (historyIdx.current === -1) {
        historyStash.current = valueRef.current;
        historyIdx.current = 0;
      } else if (historyIdx.current < history.length - 1) {
        historyIdx.current += 1;
      }
      const entry = history[historyIdx.current];
      if (entry != null) {
        setValue(entry);
        setCursorLine(0);
        setInputKey((k) => k + 1);
      }
      evt.preventDefault();
      return;
    }

    // Down arrow
    if (evt.name === "down") {
      if (multiline && cursorLine < currentLines.length - 1) {
        setCursorLine((prev) => prev + 1);
        setInputKey((k) => k + 1);
        evt.preventDefault();
        return;
      }
      if (historyIdx.current === -1) return;
      if (historyIdx.current === 0) {
        historyIdx.current = -1;
        setValue(historyStash.current);
        setCursorLine(0);
        setInputKey((k) => k + 1);
      } else {
        historyIdx.current -= 1;
        const entry = historyCacheRef.current[historyIdx.current];
        if (entry != null) {
          setValue(entry);
          setCursorLine(0);
          setInputKey((k) => k + 1);
        }
      }
      evt.preventDefault();
      return;
    }

    // Backspace at start of line in multiline — merge with previous
    if (evt.name === "backspace" && multiline && cursorLine > 0) {
      const atStart = !inputRef.current || inputRef.current.cursorOffset === 0;
      if (atStart) {
        const prevLine = currentLines[cursorLine - 1] ?? "";
        const curLine = currentLines[cursorLine] ?? "";
        const updated = [...currentLines];
        updated[cursorLine - 1] = prevLine + curLine;
        updated.splice(cursorLine, 1);
        setValue(updated.join("\n"));
        setCursorLine((prev) => prev - 1);
        setInputKey((k) => k + 1);
        evt.preventDefault();
        return;
      }
    }
  });

  const fuzzyMaxVisible = Math.min(10, Math.max(3, Math.floor(termRows * 0.3)));

  useEffect(() => {
    if (!fuzzyMode || fuzzyResults.length === 0) return;
    const offset = fuzzyScrollOffset.current;
    if (fuzzyCursor < offset) {
      fuzzyScrollOffset.current = fuzzyCursor;
      fuzzyScrollRef.current?.scrollTo(fuzzyCursor);
    } else if (fuzzyCursor >= offset + fuzzyMaxVisible) {
      const newOffset = fuzzyCursor - fuzzyMaxVisible + 1;
      fuzzyScrollOffset.current = newOffset;
      fuzzyScrollRef.current?.scrollTo(newOffset);
    }
  }, [fuzzyCursor, fuzzyMode, fuzzyResults.length, fuzzyMaxVisible]);

  // ── Rendering ──

  const borderColor = fuzzyMode ? "#FF8C00" : isLoading ? "#4a1a6b" : focused ? "#6A0DAD" : "#333";

  return (
    <box flexDirection="column" width="100%" flexShrink={0}>
      {/* ── Autocomplete dropdown ── */}
      {hasMatches && (
        <box flexDirection="column" marginBottom={0}>
          <box paddingX={1} height={1} flexDirection="row">
            <text fg="#333">{"─".repeat(40)}</text>
            {matches.length > maxVisible && <text fg="#555"> ↑↓ scroll</text>}
          </box>
          <scrollbox ref={acScrollRef} height={Math.min(matches.length, maxVisible)}>
            {matches.map((match, i) => {
              const isSelected = i === selectedIdx;
              return (
                <box key={match.cmd} gap={1} paddingX={1} height={1} flexDirection="row">
                  <text fg={isSelected ? "#FF0040" : "#333"}>{isSelected ? "›" : " "}</text>
                  <text
                    fg={isSelected ? "#FF0040" : "#9B30FF"}
                    attributes={isSelected ? TextAttributes.BOLD : undefined}
                  >
                    {match.cmd}
                  </text>
                  <text fg={isSelected ? "#666" : "#444"}>{match.desc}</text>
                </box>
              );
            })}
          </scrollbox>
        </box>
      )}

      {/* ── Fuzzy history results ── */}
      {fuzzyMode && fuzzyResults.length > 0 && (
        <box flexDirection="column" marginBottom={0}>
          <box paddingX={1} height={1} flexDirection="row" width="100%">
            <text fg="#FF8C00"> history </text>
            <text fg="#FF8C00" flexGrow={1}>
              {"─".repeat(Math.max(0, termWidth - 12))}
            </text>
          </box>
          <scrollbox ref={fuzzyScrollRef} height={Math.min(fuzzyResults.length, fuzzyMaxVisible)}>
            {fuzzyResults.map((result, i) => {
              const isSelected = i === fuzzyCursor;
              const maxChars = Math.max(20, termWidth - 6);
              const displayText = (result.entry.split("\n")[0] ?? "").slice(0, maxChars);
              const displayMatch = fuzzyQuery ? fuzzyFilter(fuzzyQuery, [displayText], 1)[0] : null;
              return (
                <box
                  key={`${result.entry.slice(0, 40)}-${String(i)}`}
                  paddingX={1}
                  height={1}
                  flexDirection="row"
                >
                  <text fg={isSelected ? "#FF0040" : "#333"}>{isSelected ? "› " : "  "}</text>
                  {displayMatch ? (
                    <HighlightedText text={displayText} indices={displayMatch.indices} />
                  ) : (
                    <text fg={isSelected ? "#fff" : "#ccc"}>{displayText}</text>
                  )}
                </box>
              );
            })}
          </scrollbox>
        </box>
      )}

      {/* ── Loading status bar ── */}
      {isLoading && (
        <box paddingX={1} height={1} gap={1} flexDirection="row">
          <text fg="#8B5CF6">{currentGhost}</text>
          <text fg="#6A0DAD">{forgeStatusRef.current}</text>
          {queueCount != null && queueCount > 0 && (
            <text fg="#555">({String(queueCount)} queued)</text>
          )}
        </box>
      )}

      {/* ── Input border box ── */}
      <box
        ref={containerRef}
        borderStyle="rounded"
        border={true}
        borderColor={borderColor}
        paddingX={1}
        flexDirection="column"
        width="100%"
      >
        {isLoading && !showAutocomplete ? (
          <box flexDirection="row" alignItems="center" width="100%" justifyContent="space-between">
            <box flexGrow={1}>
              <input
                ref={inputRef}
                key={inputKey}
                value={value}
                onInput={handleChange}
                onSubmit={() => handleSubmit(value)}
                placeholder="/ commands · queue messages"
                focused={focused}
                scrollMargin={0.01}
              />
            </box>
            <text fg="#555"> ^X stop</text>
          </box>
        ) : fuzzyMode ? (
          <box flexDirection="row">
            <text fg="#FF8C00" attributes={TextAttributes.BOLD}>
              {"search: "}
            </text>
            <text fg="#fff">{fuzzyQuery}</text>
            <text fg="#FF8C00">▌</text>
          </box>
        ) : (
          <InputEditor
            visualRows={visualRows}
            lines={lines}
            cursorLine={cursorLine}
            activeVisualIdx={activeVisualIdx}
            inputRef={inputRef}
            inputKey={inputKey}
            value={value}
            ghost={ghost}
            focused={focused}
            pasteCollapsed={pasteCollapsed}
            handleChange={handleChange}
            handleSubmit={handleSubmit}
          />
        )}
      </box>

      {/* ── Hints bar ── */}
      {focused && !fuzzyMode && isMultiline && (
        <box paddingX={2} height={1} flexDirection="row" gap={1}>
          {pasteCollapsed ? (
            <>
              <text fg="#444">↑↓</text>
              <text fg="#333">expand</text>
            </>
          ) : (
            <>
              <text fg="#444">^U</text>
              <text fg="#333">del line</text>
              <text fg="#444">^K</text>
              <text fg="#333">del to end</text>
              <text fg="#444">S-Enter</text>
              <text fg="#333">newline</text>
            </>
          )}
        </box>
      )}
    </box>
  );
}

/** The actual text editor area — handles all 3 cases: single, wrapped, multiline */
const InputEditor = memo(function InputEditor({
  visualRows,
  lines,
  cursorLine,
  activeVisualIdx,
  inputRef,
  inputKey,
  value,
  ghost,
  focused,
  pasteCollapsed,
  handleChange,
  handleSubmit,
}: {
  visualRows: VisualRow[];
  lines: string[];
  cursorLine: number;
  activeVisualIdx: number;
  inputRef: React.RefObject<InputRenderable | null>;
  inputKey: number;
  value: string;
  ghost: string;
  focused: boolean;
  pasteCollapsed: boolean;
  handleChange: (v: string) => void;
  handleSubmit: (v: string) => void;
}) {
  const isSingleRow = visualRows.length === 1 && lines.length === 1;

  // Simple single-line (most common case — optimized path)
  if (isSingleRow) {
    return (
      <box flexDirection="row" width="100%">
        <text fg="#FF0040" attributes={TextAttributes.BOLD} flexShrink={0}>
          {">"}{" "}
        </text>
        <input
          ref={inputRef}
          key={inputKey}
          value={value}
          onInput={handleChange}
          onSubmit={() => handleSubmit(value)}
          placeholder="speak to the forge..."
          focused={focused}
          flexGrow={1}
          scrollMargin={0.01}
        />
        {ghost ? (
          <text fg="#444" flexShrink={0}>
            {ghost}
          </text>
        ) : null}
      </box>
    );
  }

  // Collapsed paste: show first line + "+N lines" badge
  if (pasteCollapsed) {
    const firstLine = lines[0] ?? "";
    const extraLines = lines.length - 1;
    return (
      <box flexDirection="column">
        <box flexDirection="row" width="100%">
          <text fg="#FF0040" attributes={TextAttributes.BOLD} flexShrink={0}>
            {">"}{" "}
          </text>
          <text fg="#ccc" flexGrow={1}>
            {firstLine}
          </text>
        </box>
        <box flexDirection="row" width="100%" paddingLeft={2}>
          <text fg="#6A0DAD">{`+${String(extraLines)} line${extraLines === 1 ? "" : "s"}`}</text>
          <text fg="#444">{" (↑↓ to expand)"}</text>
        </box>
      </box>
    );
  }

  // Multi-row: wrapped single line or actual multiline
  return (
    <box flexDirection="column">
      {visualRows.map((row, vi) => {
        const isFirstRow = vi === 0;
        const isActiveRow = vi === activeVisualIdx;
        const prefix = isFirstRow ? ">" : "…";
        const prefixColor = isFirstRow ? "#FF0040" : "#555";
        const prefixAttrs = isFirstRow ? TextAttributes.BOLD : undefined;

        if (isActiveRow) {
          const activeLine = lines[cursorLine] ?? "";
          const wrapOffset = row.wrapIdx;
          const charsBeforeThisWrap = visualRows
            .filter((r) => r.lineIdx === cursorLine && r.wrapIdx < wrapOffset)
            .reduce((sum, r) => sum + r.text.length, 0);

          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable visual row order
            <box key={vi} flexDirection="row" width="100%">
              <text fg={prefixColor} attributes={prefixAttrs} flexShrink={0}>
                {prefix}{" "}
              </text>
              <input
                ref={inputRef}
                key={inputKey}
                value={row.isLastWrap ? activeLine.slice(charsBeforeThisWrap) : row.text}
                scrollMargin={0.01}
                onInput={
                  row.isLastWrap && lines.length === 1
                    ? (newVal: string) => {
                        handleChange(activeLine.slice(0, charsBeforeThisWrap) + newVal);
                      }
                    : row.isLastWrap
                      ? (newVal: string) => {
                          const updated = [...lines];
                          updated[cursorLine] = activeLine.slice(0, charsBeforeThisWrap) + newVal;
                          handleChange(updated.join("\n"));
                        }
                      : handleChange
                }
                onSubmit={() => handleSubmit(value)}
                focused={focused}
                flexGrow={1}
              />
            </box>
          );
        }

        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable visual row order
          <box key={vi} flexDirection="row" width="100%">
            <text fg={prefixColor} attributes={prefixAttrs} flexShrink={0}>
              {prefix}{" "}
            </text>
            <text fg="#ccc">{row.text || " "}</text>
          </box>
        );
      })}
    </box>
  );
});
