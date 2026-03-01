import type { ModelMessage } from "ai";
import { generateText } from "ai";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createForgeAgent } from "../core/agents/index.js";
import { ContextManager } from "../core/context/manager.js";
import { getGitDiff, getGitStatus, gitInit } from "../core/git/status.js";
import { UI_ICONS } from "../core/icons.js";
import { resolveModel } from "../core/llm/provider.js";
import { useEditorFocus } from "../hooks/useEditorFocus.js";
import { useEditorInput } from "../hooks/useEditorInput.js";
import { useForgeMode } from "../hooks/useForgeMode.js";
import { useGitStatus } from "../hooks/useGitStatus.js";
import { useNeovim } from "../hooks/useNeovim.js";
import type { AppConfig, ChatMessage } from "../types/index.js";
import { ContextBar } from "./ContextBar.js";
import { EditorPanel } from "./EditorPanel.js";
import { Footer } from "./Footer.js";
import { GitCommitModal } from "./GitCommitModal.js";
import { InputBox } from "./InputBox.js";
import { LlmSelector } from "./LlmSelector.js";
import { MessageList } from "./MessageList.js";
import { SkillSearch } from "./SkillSearch.js";
import { StreamingText } from "./StreamingText.js";
import { type LiveToolCall, ToolCallDisplay } from "./ToolCallDisplay.js";

type StreamSegment = { type: "text"; content: string } | { type: "tools"; callIds: string[] };

interface Props {
  config: AppConfig;
}

export function App({ config }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [coreMessages, setCoreMessages] = useState<ModelMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamSegments, setStreamSegments] = useState<StreamSegment[]>([]);
  const [liveToolCalls, setLiveToolCalls] = useState<LiveToolCall[]>([]);

  // Editor state
  const { focusMode, editorOpen, toggleFocus } = useEditorFocus();
  const [editorVisible, setEditorVisible] = useState(false);
  const {
    ready: nvimReady,
    screenLines,
    defaultBg,
    modeName: nvimMode,
    fileName: editorFile,
    openFile: nvimOpen,
    sendKeys,
    error: nvimError,
  } = useNeovim(editorOpen, config.nvimPath);

  // Track visual presence: visible when open, stays visible during close animation
  useEffect(() => {
    if (editorOpen) setEditorVisible(true);
  }, [editorOpen]);

  const handleEditorClosed = useCallback(() => {
    setEditorVisible(false);
  }, []);

  useEditorInput(sendKeys, focusMode === "editor" && nvimReady);

  // LLM state
  const [activeModel, setActiveModel] = useState(config.defaultModel);
  const [showLlmSelector, setShowLlmSelector] = useState(false);
  const [showSkillSearch, setShowSkillSearch] = useState(false);
  const [showGitCommit, setShowGitCommit] = useState(false);
  const [tokenUsage, setTokenUsage] = useState({ prompt: 0, completion: 0, total: 0 });

  const cwd = process.cwd();
  const contextManager = useMemo(() => new ContextManager(cwd), [cwd]);
  const git = useGitStatus(cwd);
  const {
    mode: forgeMode,
    cycleMode,
    modeLabel,
    modeColor,
    setMode: setForgeMode,
  } = useForgeMode();

  // Sync forge mode to context manager
  useEffect(() => {
    contextManager.setForgeMode(forgeMode);
  }, [forgeMode, contextManager]);

  // Sync editor state to context manager
  useEffect(() => {
    contextManager.setEditorState(editorOpen, editorFile, nvimMode);
  }, [editorOpen, editorFile, nvimMode, contextManager]);

  // Refresh git context on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: contextManager is stable (useMemo on cwd)
  useEffect(() => {
    contextManager.refreshGitContext();
  }, []);
  const termHeight = stdout?.rows ?? 40;

  const chatChars = useMemo(
    () =>
      coreMessages.reduce(
        (sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0),
        0,
      ),
    [coreMessages],
  );

  const summarizeConversation = useCallback(async () => {
    if (coreMessages.length < 4) return;
    try {
      const model = resolveModel(activeModel);
      const convoText = coreMessages
        .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content.slice(0, 500) : ""}`)
        .join("\n");
      const { text: summary } = await generateText({
        model,
        prompt: `Summarize this conversation in 2-3 concise sentences, preserving key decisions and context:\n\n${convoText}`,
      });
      const summaryMsg: ModelMessage = {
        role: "user" as const,
        content: `[Previous conversation summary: ${summary}]`,
      };
      setCoreMessages([summaryMsg]);
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Context compressed. Summary: ${summary}`,
          timestamp: Date.now(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: "Failed to summarize conversation.", timestamp: Date.now() },
      ]);
    }
  }, [coreMessages, activeModel]);

  // Auto-summarize when context is getting large (>80% of budget)
  const autoSummarizedRef = useRef(false);
  useEffect(() => {
    const systemChars = contextManager.getContextBreakdown().reduce((sum, s) => sum + s.chars, 0);
    const totalChars = systemChars + chatChars;
    const pct = totalChars / 12_288;
    if (pct > 0.8 && !autoSummarizedRef.current && coreMessages.length >= 6) {
      autoSummarizedRef.current = true;
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: "Context at >80% capacity. Auto-summarizing conversation...",
          timestamp: Date.now(),
        },
      ]);
      summarizeConversation();
    }
    if (pct < 0.5) {
      autoSummarizedRef.current = false;
    }
  }, [chatChars, contextManager, coreMessages.length, summarizeConversation]);

  const { displayProvider, displayModel } = useMemo(() => {
    const idx = activeModel.indexOf("/");
    return {
      displayProvider: idx >= 0 ? activeModel.slice(0, idx) : "unknown",
      displayModel: idx >= 0 ? activeModel.slice(idx + 1) : activeModel,
    };
  }, [activeModel]);

  // Show nvim errors in chat
  useEffect(() => {
    if (nvimError) {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Neovim error: ${nvimError}`, timestamp: Date.now() },
      ]);
    }
  }, [nvimError]);

  // Global keybindings
  useInput(
    (input, key) => {
      if (key.ctrl && input === "e") {
        toggleFocus();
        return;
      }
      if (focusMode === "editor") return;

      if (key.ctrl && input === "c") {
        exit();
      }
      if (key.ctrl && input === "l") {
        setShowLlmSelector((prev) => !prev);
      }
      if (key.ctrl && input === "s") {
        setShowSkillSearch((prev) => !prev);
      }
      if (key.ctrl && input === "k") {
        setMessages([]);
        setCoreMessages([]);
        setStreamSegments([]);
      }
      if (key.ctrl && input === "d") {
        cycleMode();
      }
      if (key.ctrl && input === "g") {
        setShowGitCommit((prev) => !prev);
      }
      if (key.ctrl && input === "h") {
        showHelp(setMessages);
      }
    },
    { isActive: !showLlmSelector && !showSkillSearch && !showGitCommit },
  );

  const handleSubmit = useCallback(
    async (input: string) => {
      if (input.startsWith("/")) {
        handleCommand(
          input,
          setMessages,
          setCoreMessages,
          toggleFocus,
          nvimOpen,
          exit,
          () => setShowSkillSearch(true),
          () => setShowGitCommit(true),
          cwd,
          () => {
            git.refresh();
            contextManager.refreshGitContext();
          },
          setForgeMode,
          forgeMode,
          modeLabel,
          contextManager,
          summarizeConversation,
        );
        return;
      }

      const userMsg: ChatMessage = { role: "user", content: input, timestamp: Date.now() };
      setMessages((prev) => [...prev, userMsg]);

      const newCoreMessages: ModelMessage[] = [
        ...coreMessages,
        { role: "user" as const, content: input },
      ];
      setCoreMessages(newCoreMessages);
      setIsLoading(true);
      setStreamSegments([]);
      setLiveToolCalls([]);

      try {
        const model = resolveModel(activeModel);
        const agent = createForgeAgent({ model, contextManager });
        const result = await agent.stream({ messages: newCoreMessages });

        let fullText = "";
        const toolCallArgs = new Map<string, string>();
        const completedCalls: import("../types/index.js").ToolCall[] = [];
        const runningTokens = { prompt: 0, completion: 0, total: 0 };

        for await (const part of result.fullStream) {
          switch (part.type) {
            case "text-delta":
              fullText += part.text;
              setStreamSegments((prev) => {
                const last = prev[prev.length - 1];
                if (last?.type === "text") {
                  return [
                    ...prev.slice(0, -1),
                    { type: "text" as const, content: last.content + part.text },
                  ];
                }
                return [...prev, { type: "text" as const, content: part.text }];
              });
              break;
            case "tool-input-start":
              setLiveToolCalls((prev) => [
                ...prev,
                { id: part.id, toolName: part.toolName, state: "running" },
              ]);
              setStreamSegments((prev) => {
                const last = prev[prev.length - 1];
                if (last?.type === "tools") {
                  return [
                    ...prev.slice(0, -1),
                    { type: "tools" as const, callIds: [...last.callIds, part.id] },
                  ];
                }
                return [...prev, { type: "tools" as const, callIds: [part.id] }];
              });
              toolCallArgs.set(part.id, "");
              break;
            case "tool-input-delta":
              toolCallArgs.set(part.id, (toolCallArgs.get(part.id) ?? "") + part.delta);
              setLiveToolCalls((prev) =>
                prev.map((tc) =>
                  tc.id === part.id ? { ...tc, args: toolCallArgs.get(part.id) } : tc,
                ),
              );
              break;
            case "tool-result": {
              const resultStr =
                typeof part.output === "string" ? part.output : JSON.stringify(part.output);
              setLiveToolCalls((prev) =>
                prev.map((tc) =>
                  tc.id === part.toolCallId ? { ...tc, state: "done", result: resultStr } : tc,
                ),
              );
              completedCalls.push({
                id: part.toolCallId,
                name: part.toolName,
                args: JSON.parse(toolCallArgs.get(part.toolCallId) ?? "{}"),
                result: { success: true, output: resultStr },
              });
              break;
            }
            case "tool-error":
              setLiveToolCalls((prev) =>
                prev.map((tc) =>
                  tc.id === part.toolCallId
                    ? { ...tc, state: "error", error: String(part.error) }
                    : tc,
                ),
              );
              completedCalls.push({
                id: part.toolCallId,
                name: part.toolName,
                args: JSON.parse(toolCallArgs.get(part.toolCallId) ?? "{}"),
                result: { success: false, output: "", error: String(part.error) },
              });
              break;
            case "finish-step": {
              const su = part.usage;
              runningTokens.prompt += su.inputTokens ?? 0;
              runningTokens.completion += su.outputTokens ?? 0;
              runningTokens.total = runningTokens.prompt + runningTokens.completion;
              setTokenUsage({ ...runningTokens });
              break;
            }
          }
        }

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: fullText,
          timestamp: Date.now(),
          toolCalls: completedCalls.length > 0 ? completedCalls : undefined,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setCoreMessages((prev) => [...prev, { role: "assistant" as const, content: fullText }]);
        setStreamSegments([]);
        setLiveToolCalls([]);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${errorMsg}`, timestamp: Date.now() },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [
      coreMessages,
      activeModel,
      contextManager,
      toggleFocus,
      nvimOpen,
      exit,
      cwd,
      git,
      forgeMode,
      modeLabel,
      setForgeMode,
      summarizeConversation,
    ],
  );

  return (
    <Box flexDirection="column" height={termHeight}>
      {/* Header — SoulForge | model | by ProxySoul */}
      <Box flexShrink={0} width="100%" paddingX={1} justifyContent="space-between" height={1}>
        <Box gap={1} flexShrink={1}>
          <Text color="#9B30FF" bold>
            󰊠 SoulForge
          </Text>
          {tokenUsage.total > 0 && (
            <>
              <Text color="#333">│</Text>
              <Text color="#444">tokens {tokenUsage.total.toLocaleString()}</Text>
            </>
          )}
          <Text color="#333">│</Text>
          <ContextBar contextManager={contextManager} chatChars={chatChars} />
          <Text color="#333">│</Text>
          {git.isRepo ? (
            <Text color={git.isDirty ? "#FF8C00" : "#2d5"}>
              {UI_ICONS.git} {git.branch ?? "HEAD"}
              {git.isDirty ? "*" : ""}
            </Text>
          ) : (
            <Text color="#333">{UI_ICONS.git} no repo</Text>
          )}
          {forgeMode !== "default" && (
            <>
              <Text color="#333">│</Text>
              <Text color={modeColor} bold>
                [{modeLabel}]
              </Text>
            </>
          )}
        </Box>
        <Text wrap="truncate">
          <Text color="#6A0DAD"></Text>
          <Text backgroundColor="#6A0DAD" color="white" bold>
            {` 󰘦 ${displayProvider}/${displayModel} `}
          </Text>
          <Text color="#6A0DAD"></Text>
        </Text>
        <Text italic>
          <Text color="#333">by </Text>
          <Text color="#9B30FF">Proxy</Text>
          <Text color="#FF0040">Soul</Text>
        </Text>
      </Box>

      {/* Main content — LLM selector lives here so its scrim stays within bounds */}
      <Box flexDirection="row" flexGrow={1} flexShrink={1} minHeight={0}>
        {/* Editor panel */}
        <EditorPanel
          isOpen={editorOpen}
          fileName={editorFile}
          screenLines={screenLines}
          defaultBg={defaultBg}
          modeName={nvimMode}
          focused={focusMode === "editor"}
          onClosed={handleEditorClosed}
        />

        {/* Chat — full width, no border */}
        <Box flexDirection="column" width={editorVisible ? "40%" : "100%"}>
          {/* Messages */}
          <Box
            flexDirection="column"
            flexGrow={1}
            flexShrink={1}
            minHeight={0}
            overflowY="hidden"
            justifyContent={
              messages.length === 0 && streamSegments.length === 0 ? "center" : "flex-end"
            }
          >
            {messages.length === 0 && streamSegments.length === 0 ? (
              <Box flexDirection="column" alignItems="center" paddingX={2}>
                <Text color="#9B30FF" bold>
                  󰊠
                </Text>
                <Text color="#9B30FF" bold>
                  SoulForge
                </Text>
                <Text color="#333"> </Text>
                <Text color="#555">AI-Powered Terminal IDE</Text>
                <Text color="#333"> </Text>
                <Text color="#444">Ask anything, or try:</Text>
                <Text color="#666">
                  {"  "}/help{"    "}/open {"<file>"}
                  {"    "}/editor
                </Text>
              </Box>
            ) : (
              <>
                <MessageList messages={messages} />

                {streamSegments.length > 0 && (
                  <Box flexDirection="column" paddingX={1} flexShrink={0}>
                    <Box gap={1}>
                      <Text color="#9B30FF" bold>
                        󰚩
                      </Text>
                      <Text color="#9B30FF" bold>
                        Forge
                      </Text>
                    </Box>
                    <StreamSegmentList segments={streamSegments} toolCalls={liveToolCalls} />
                  </Box>
                )}
              </>
            )}
          </Box>

          {/* Input — flush to bottom */}
          <InputBox
            onSubmit={handleSubmit}
            isLoading={isLoading}
            isFocused={focusMode === "chat" && !showLlmSelector && !showSkillSearch}
          />
        </Box>

        {/* LLM Selector — inside main content so scrim doesn't cover header/footer */}
        <LlmSelector
          visible={showLlmSelector}
          activeModel={activeModel}
          onSelect={setActiveModel}
          onClose={() => setShowLlmSelector(false)}
        />

        {/* Git Commit Modal */}
        <GitCommitModal
          visible={showGitCommit}
          cwd={cwd}
          onClose={() => setShowGitCommit(false)}
          onCommitted={(msg) => {
            setMessages((prev) => [
              ...prev,
              { role: "system", content: `Committed: ${msg}`, timestamp: Date.now() },
            ]);
          }}
          onRefresh={() => {
            git.refresh();
            contextManager.refreshGitContext();
          }}
        />

        {/* Skills Search */}
        <SkillSearch
          visible={showSkillSearch}
          contextManager={contextManager}
          onClose={() => setShowSkillSearch(false)}
          onSystemMessage={(msg) => {
            setMessages((prev) => [
              ...prev,
              { role: "system", content: msg, timestamp: Date.now() },
            ]);
          }}
        />
      </Box>

      {/* Footer — branding + shortcuts */}
      <Box flexShrink={0} width="100%">
        <Footer />
      </Box>
    </Box>
  );
}

function StreamSegmentList({
  segments,
  toolCalls,
}: {
  segments: StreamSegment[];
  toolCalls: LiveToolCall[];
}) {
  const toolCallMap = useMemo(() => new Map(toolCalls.map((tc) => [tc.id, tc])), [toolCalls]);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return (
            <Box key={`text-${String(i)}`} marginLeft={2} width="100%">
              <StreamingText text={seg.content} />
            </Box>
          );
        }
        const calls = seg.callIds
          .map((id) => toolCallMap.get(id))
          .filter((tc): tc is LiveToolCall => tc != null);
        return calls.length > 0 ? <ToolCallDisplay key={seg.callIds[0]} calls={calls} /> : null;
      })}
    </>
  );
}

function showHelp(setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>) {
  setMessages((prev) => [
    ...prev,
    {
      role: "system",
      content: [
        "SoulForge Commands:",
        "  /help       — show this help",
        "  /clear      — clear chat history",
        "  /editor     — toggle editor panel",
        "  /open <path> — open file in editor",
        "  /skills     — browse & install skills",
        "  /commit     — AI-assisted git commit",
        "  /diff       — show current diff",
        "  /status     — git status",
        "  /branch     — show/create branch",
        "  /init       — initialize git repo",
        "  /summarize  — compress conversation to save context",
        "  /context    — show context budget breakdown",
        "  /mode       — show/switch forge mode",
        "  /quit       — exit soulforge",
        "",
        "Keybindings:",
        "  Ctrl+D      — cycle forge mode",
        "  Ctrl+E      — toggle editor / focus",
        "  Ctrl+G      — git commit",
        "  Ctrl+L      — switch LLM model",
        "  Ctrl+S      — browse skills",
        "  Ctrl+K      — clear chat",
        "  Ctrl+H      — show help",
        "  Ctrl+C      — exit",
      ].join("\n"),
      timestamp: Date.now(),
    },
  ]);
}

function handleCommand(
  input: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setCoreMessages: React.Dispatch<React.SetStateAction<ModelMessage[]>>,
  toggleFocus: () => void,
  nvimOpen: (path: string) => Promise<void>,
  exit: () => void,
  openSkills: () => void,
  openGitCommit: () => void,
  cwd: string,
  refreshGit: () => void,
  setForgeMode: (mode: import("../types/index.js").ForgeMode) => void,
  currentMode: import("../types/index.js").ForgeMode,
  currentModeLabel: string,
  contextManager: ContextManager,
  summarizeConversation: () => Promise<void>,
) {
  const trimmed = input.trim();
  const cmd = trimmed.toLowerCase();

  if (cmd.startsWith("/open ")) {
    const filePath = trimmed.slice(6).trim();
    if (!filePath) {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: "Usage: /open <file-path>", timestamp: Date.now() },
      ]);
      return;
    }
    nvimOpen(filePath).catch(() => {});
    setMessages((prev) => [
      ...prev,
      { role: "system", content: `Opening ${filePath} in editor...`, timestamp: Date.now() },
    ]);
    return;
  }

  if (cmd.startsWith("/mode ")) {
    const modeName = trimmed.slice(6).trim().toLowerCase();
    const validModes = ["default", "architect", "socratic", "challenge"] as const;
    const matched = validModes.find((m) => m === modeName);
    if (matched) {
      setForgeMode(matched);
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Forge mode set to: ${matched}`, timestamp: Date.now() },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Unknown mode: ${modeName}. Available: default, architect, socratic, challenge`,
          timestamp: Date.now(),
        },
      ]);
    }
    return;
  }

  if (cmd.startsWith("/context clear") || cmd === "/context reset") {
    const what = cmd.includes("git")
      ? "git"
      : cmd.includes("skills")
        ? "skills"
        : cmd.includes("memory")
          ? "memory"
          : "all";
    const cleared = contextManager.clearContext(what as "git" | "memory" | "skills" | "all");
    setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: cleared.length > 0 ? `Cleared: ${cleared.join(", ")}` : "Nothing to clear.",
        timestamp: Date.now(),
      },
    ]);
    return;
  }

  if (cmd === "/git init" || cmd === "/init") {
    gitInit(cwd).then((ok) => {
      refreshGit();
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: ok ? "Initialized git repository." : "Failed to initialize git repository.",
          timestamp: Date.now(),
        },
      ]);
    });
    return;
  }

  if (cmd.startsWith("/branch ")) {
    const branchName = trimmed.slice(8).trim();
    if (branchName) {
      const { spawn } = require("node:child_process") as typeof import("node:child_process");
      const proc = spawn("git", ["checkout", "-b", branchName], { cwd });
      const chunks: string[] = [];
      proc.stdout.on("data", (d: Buffer) => chunks.push(d.toString()));
      proc.stderr.on("data", (d: Buffer) => chunks.push(d.toString()));
      proc.on("close", (code) => {
        refreshGit();
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: code === 0 ? `Switched to new branch '${branchName}'` : chunks.join("").trim(),
            timestamp: Date.now(),
          },
        ]);
      });
    }
    return;
  }

  switch (cmd) {
    case "/quit":
    case "/exit":
      exit();
      break;
    case "/clear":
      setMessages([]);
      setCoreMessages([]);
      break;
    case "/editor":
    case "/edit":
      toggleFocus();
      break;
    case "/help":
      showHelp(setMessages);
      break;
    case "/skills":
      openSkills();
      break;
    case "/summarize":
      setMessages((prev) => [
        ...prev,
        { role: "system", content: "Summarizing conversation...", timestamp: Date.now() },
      ]);
      summarizeConversation();
      break;
    case "/commit":
      openGitCommit();
      break;
    case "/diff":
      getGitDiff(cwd).then((diff) => {
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: diff ? `\`\`\`diff\n${diff}\`\`\`` : "No unstaged changes.",
            timestamp: Date.now(),
          },
        ]);
      });
      break;
    case "/status":
      getGitStatus(cwd).then((status) => {
        if (!status.isRepo) {
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: "Not a git repository. Use /init to initialize.",
              timestamp: Date.now(),
            },
          ]);
          return;
        }
        const lines = [
          `Branch: ${status.branch ?? "(detached)"}`,
          `Staged: ${String(status.staged.length)} file(s)`,
          `Modified: ${String(status.modified.length)} file(s)`,
          `Untracked: ${String(status.untracked.length)} file(s)`,
        ];
        if (status.ahead > 0) lines.push(`Ahead: ${String(status.ahead)}`);
        if (status.behind > 0) lines.push(`Behind: ${String(status.behind)}`);
        setMessages((prev) => [
          ...prev,
          { role: "system", content: lines.join("\n"), timestamp: Date.now() },
        ]);
      });
      break;
    case "/branch":
      getGitStatus(cwd).then((status) => {
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: status.branch
              ? `Current branch: ${status.branch}`
              : "Not on a branch (detached HEAD)",
            timestamp: Date.now(),
          },
        ]);
      });
      break;
    case "/context": {
      const breakdown = contextManager.getContextBreakdown();
      const total = breakdown.reduce((sum, s) => sum + s.chars, 0);
      const lines = breakdown
        .filter((s) => s.active)
        .map((s) => {
          const kb = (s.chars / 1024).toFixed(1);
          const pct = total > 0 ? Math.round((s.chars / total) * 100) : 0;
          return `  ${String(pct).padStart(3)}%  ${kb.padStart(5)}k  ${s.section}`;
        });
      const totalKb = (total / 1024).toFixed(1);
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: [
            `System prompt context: ${totalKb}k chars`,
            "",
            ...lines,
            "",
            "Clear with: /context clear [git|skills|memory]",
          ].join("\n"),
          timestamp: Date.now(),
        },
      ]);
      break;
    }
    case "/mode":
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Current mode: ${currentModeLabel} (${currentMode})\nAvailable: /mode default | architect | socratic | challenge`,
          timestamp: Date.now(),
        },
      ]);
      break;
    default:
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Unknown command: ${cmd}. Type /help for available commands.`,
          timestamp: Date.now(),
        },
      ]);
  }
}
