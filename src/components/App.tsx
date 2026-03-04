import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { ScrollView, type ScrollViewRef } from "ink-scroll-view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mergeConfigs, saveConfig } from "../config/index.js";
import { ContextManager } from "../core/context/manager.js";
import { providerIcon, UI_ICONS } from "../core/icons.js";
import { initForbidden } from "../core/security/forbidden.js";
import { SessionManager } from "../core/sessions/manager.js";
import { getMissingRequired } from "../core/setup/prerequisites.js";
import { suspendAndRun } from "../core/terminal/suspend.js";
import { useChat } from "../hooks/useChat.js";
import { useEditorFocus } from "../hooks/useEditorFocus.js";
import { useEditorInput } from "../hooks/useEditorInput.js";
import { useForgeMode } from "../hooks/useForgeMode.js";
import { useGitStatus } from "../hooks/useGitStatus.js";
import { useMouse } from "../hooks/useMouse.js";
import { useNeovim } from "../hooks/useNeovim.js";
import { useTabs } from "../hooks/useTabs.js";
import type { AppConfig, ChatStyle, EditorIntegration, TaskRouter } from "../types/index.js";
import { ContextBar } from "./ContextBar.js";
import { handleCommand } from "./commands.js";
import { EditorPanel } from "./EditorPanel.js";
import { EditorSettings } from "./EditorSettings.js";
import { ErrorLog } from "./ErrorLog.js";
import { Footer } from "./Footer.js";
import { GhostLogo } from "./GhostLogo.js";
import { GitCommitModal } from "./GitCommitModal.js";
import { GitMenu } from "./GitMenu.js";
import { HealthCheck } from "./HealthCheck.js";
import { HelpPopup } from "./HelpPopup.js";
import { InputBox } from "./InputBox.js";
import { LlmSelector } from "./LlmSelector.js";
import { CodeExpandedProvider } from "./Markdown.js";
import { MessageList } from "./MessageList.js";
import { PlanReviewPrompt } from "./PlanReviewPrompt.js";
import { QuestionPrompt } from "./QuestionPrompt.js";
import { RightSidebar } from "./RightSidebar.js";
import { RouterSettings } from "./RouterSettings.js";
import { SessionPicker } from "./SessionPicker.js";
import { SetupGuide } from "./SetupGuide.js";
import { SkillSearch } from "./SkillSearch.js";
import { StreamSegmentList } from "./StreamSegmentList.js";
import { SystemBanner } from "./SystemBanner.js";
import { TabBar } from "./TabBar.js";
import { TokenDisplay } from "./TokenDisplay.js";

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

interface Props {
  config: AppConfig;
  projectConfig?: Partial<AppConfig> | null;
}

export function App({ config, projectConfig }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Tiered config: session > project > global
  const [sessionConfig, setSessionConfig] = useState<Partial<AppConfig> | null>(null);
  const effectiveConfig = useMemo(
    () => mergeConfigs(config, projectConfig ?? null, sessionConfig),
    [config, projectConfig, sessionConfig],
  );

  // Editor state
  const { focusMode, editorOpen, toggleFocus, setFocus, openEditor, closeEditor } =
    useEditorFocus();
  const [editorVisible, setEditorVisible] = useState(false);
  const {
    ready: nvimReady,
    screenLines,
    defaultBg,
    modeName: nvimMode,
    fileName: editorFile,
    cursorLine,
    cursorCol,
    visualSelection,
    openFile: nvimOpen,
    sendKeys,
    error: nvimError,
  } = useNeovim(editorOpen, effectiveConfig.nvimPath, effectiveConfig.nvimConfig, closeEditor);

  // Queue a file to open once neovim is ready
  const pendingEditorFileRef = useRef<string | null>(null);

  useEffect(() => {
    if (nvimReady && pendingEditorFileRef.current) {
      const file = pendingEditorFileRef.current;
      pendingEditorFileRef.current = null;
      nvimOpen(file).catch(() => {});
    }
  }, [nvimReady, nvimOpen]);

  const openEditorWithFile = useCallback(
    (file: string) => {
      if (editorOpen && nvimReady) {
        nvimOpen(file).catch(() => {});
      } else {
        pendingEditorFileRef.current = file;
        openEditor();
      }
    },
    [editorOpen, nvimReady, nvimOpen, openEditor],
  );

  // Track visual presence: visible when open, stays visible during close animation
  useEffect(() => {
    if (editorOpen) setEditorVisible(true);
  }, [editorOpen]);

  const handleEditorClosed = useCallback(() => {
    setEditorVisible(false);
  }, []);

  useEditorInput(sendKeys, focusMode === "editor" && nvimReady);

  // UI modal state
  const [showLlmSelector, setShowLlmSelector] = useState(false);
  const [showSkillSearch, setShowSkillSearch] = useState(false);
  const [showGitCommit, setShowGitCommit] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showHelpPopup, setShowHelpPopup] = useState(false);
  const [showErrorLog, setShowErrorLog] = useState(false);
  const [showGitMenu, setShowGitMenu] = useState(false);
  const [showEditorSettings, setShowEditorSettings] = useState(false);
  const [showRouterSettings, setShowRouterSettings] = useState(false);
  const [routerSlotPicking, setRouterSlotPicking] = useState<keyof TaskRouter | null>(null);
  const [showSetup, setShowSetup] = useState(() => getMissingRequired().length > 0);
  const [suspended, setSuspended] = useState(false);
  const [codeExpanded, setCodeExpanded] = useState(false);
  const [chatStyle, setChatStyle] = useState<ChatStyle>("accent");
  const scrollRef = useRef<ScrollViewRef>(null);
  const shouldAutoScroll = useRef(true);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [chatViewportHeight, setChatViewportHeight] = useState(0);

  const cwd = process.cwd();

  // Initialize security guard once
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-time init
  useEffect(() => {
    initForbidden(cwd);
  }, []);

  const contextManager = useMemo(() => new ContextManager(cwd), [cwd]);
  const sessionManager = useMemo(() => new SessionManager(cwd), [cwd]);
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
    contextManager.setEditorState(
      editorOpen,
      editorFile,
      nvimMode,
      cursorLine,
      cursorCol,
      visualSelection,
    );
  }, [editorOpen, editorFile, nvimMode, cursorLine, cursorCol, visualSelection, contextManager]);

  // Sync editor integration settings to context manager
  useEffect(() => {
    if (effectiveConfig.editorIntegration) {
      contextManager.setEditorIntegration(effectiveConfig.editorIntegration);
    }
  }, [effectiveConfig.editorIntegration, contextManager]);

  // Refresh git context on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: contextManager is stable (useMemo on cwd)
  useEffect(() => {
    contextManager.refreshGitContext();
  }, []);

  const termHeight = stdout?.rows ?? 40;

  // biome-ignore lint/correctness/useExhaustiveDependencies: chat.setMessages is a stable useState setter
  const handleSuspend = useCallback(
    async (opts: { command: string; args?: string[]; noAltScreen?: boolean }) => {
      setSuspended(true);
      await new Promise((r) => setTimeout(r, 50));
      const result = await suspendAndRun({ ...opts, cwd });
      setSuspended(false);
      if (result.exitCode === null) {
        chat.setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "system",
            content: `Failed to launch ${opts.command}. Is it installed?`,
            timestamp: Date.now(),
          },
        ]);
      }
      git.refresh();
      contextManager.refreshGitContext();
    },
    [cwd, git, contextManager],
  );

  // ─── Chat hook (all chat state + LLM logic) ───
  const chat = useChat({
    effectiveConfig,
    contextManager,
    sessionManager,
    cwd,
    openEditorWithFile,
    openEditor,
    onSuspend: handleSuspend,
  });

  // ─── Tab management ───
  const tabMgr = useTabs({ chat, defaultModel: effectiveConfig.defaultModel });

  // Auto-label tab from first user message
  // biome-ignore lint/correctness/useExhaustiveDependencies: only react to message count changes
  useEffect(() => {
    const firstUser = chat.messages.find((m) => m.role === "user");
    if (firstUser) {
      tabMgr.autoLabel(tabMgr.activeTabId, firstUser.content);
    }
  }, [chat.messages.length]);

  // Auto-save tab layout to .soulforge/tabs.json
  // biome-ignore lint/correctness/useExhaustiveDependencies: save on tab count/active changes
  useEffect(() => {
    if (tabMgr.tabCount <= 1) return;
    try {
      const dir = join(cwd, ".soulforge");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const layout = tabMgr.tabs.map((t) => ({
        id: t.id,
        label: t.label,
        activeModel: t.id === tabMgr.activeTabId ? chat.activeModel : undefined,
      }));
      writeFileSync(join(dir, "tabs.json"), JSON.stringify(layout, null, 2));
    } catch {
      // Ignore write failures
    }
  }, [tabMgr.tabCount, tabMgr.activeTabId]);

  const { displayProvider, displayModel, isGateway, isProxy } = useMemo(() => {
    const isGw = chat.activeModel.startsWith("gateway/");
    const isPrx = chat.activeModel.startsWith("proxy/");
    if (isGw || isPrx) {
      const prefix = isGw ? "gateway/" : "proxy/";
      const rest = chat.activeModel.slice(prefix.length);
      const idx = rest.indexOf("/");
      return {
        displayProvider: idx >= 0 ? rest.slice(0, idx) : rest,
        displayModel: idx >= 0 ? rest.slice(idx + 1) : rest,
        isGateway: isGw,
        isProxy: isPrx,
      };
    }
    const idx = chat.activeModel.indexOf("/");
    return {
      displayProvider: idx >= 0 ? chat.activeModel.slice(0, idx) : "unknown",
      displayModel: idx >= 0 ? chat.activeModel.slice(idx + 1) : chat.activeModel,
      isGateway: false,
      isProxy: false,
    };
  }, [chat.activeModel]);

  // Auto-scroll to bottom when new messages arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: only reset on message count change
  useEffect(() => {
    shouldAutoScroll.current = true;
    scrollRef.current?.scrollToBottom();
  }, [chat.messages.length]);

  // Keep viewport pinned to bottom during streaming
  const handleContentHeightChange = useCallback(() => {
    if (shouldAutoScroll.current) {
      scrollRef.current?.scrollToBottom();
    }
  }, []);

  // Track viewport size for bottom-alignment
  const handleViewportSizeChange = useCallback((size: { width: number; height: number }) => {
    setChatViewportHeight(size.height);
  }, []);

  // Track scroll position for auto-scroll + indicator
  const handleScroll = useCallback((offset: number) => {
    const sr = scrollRef.current;
    if (!sr) return;
    const ch = sr.getContentHeight();
    const vh = sr.getViewportHeight();
    const atBottom = ch <= vh || offset >= ch - vh - 1;
    shouldAutoScroll.current = atBottom;
    setIsScrolledUp(!atBottom);
  }, []);

  // Re-measure on terminal resize
  useEffect(() => {
    const handleResize = () => scrollRef.current?.remeasure();
    stdout?.on("resize", handleResize);
    return () => {
      stdout?.off("resize", handleResize);
    };
  }, [stdout]);

  // Show nvim errors in chat
  // biome-ignore lint/correctness/useExhaustiveDependencies: chat.setMessages is a stable useState setter
  useEffect(() => {
    if (nvimError) {
      chat.setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: `Neovim error: ${nvimError}`,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [nvimError]);

  // Wrapper for handleSubmit that intercepts slash commands and plan mode
  const handleInputSubmit = useCallback(
    async (input: string) => {
      if (input.startsWith("/")) {
        // Handle /continue
        if (input.trim().toLowerCase() === "/continue") {
          handleInputSubmit("Continue from where you left off. Complete any remaining work.");
          return;
        }
        // Handle /plan — toggle plan mode
        if (
          input.trim().toLowerCase() === "/plan" ||
          input.trim().toLowerCase().startsWith("/plan ")
        ) {
          const desc = input.trim().slice(5).trim();
          if (chat.planMode) {
            // Already in plan mode — toggle OFF
            chat.setPlanMode(false);
            chat.setPlanRequest(null);
            setForgeMode("default");
            chat.setShowPlanReview(false);
            chat.setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "system",
                content: "Plan mode OFF",
                timestamp: Date.now(),
              },
            ]);
          } else {
            // Enter plan mode
            chat.setPlanMode(true);
            chat.setPlanRequest(desc || null);
            setForgeMode("plan");
            contextManager.setForgeMode("plan");
            chat.setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "system",
                content: "Plan mode ON — Forge will research and plan without making changes.",
                timestamp: Date.now(),
              },
            ]);
            if (desc) {
              setTimeout(() => chat.handleSubmit(desc), 0);
            }
          }
          return;
        }
        handleCommand(input, {
          chat,
          tabMgr,
          toggleFocus,
          nvimOpen,
          exit,
          openSkills: () => setShowSkillSearch(true),
          openGitCommit: () => setShowGitCommit(true),
          openSessions: () => setShowSessionPicker(true),
          openHelp: () => setShowHelpPopup(true),
          openErrorLog: () => setShowErrorLog(true),
          cwd,
          refreshGit: () => {
            git.refresh();
            contextManager.refreshGitContext();
          },
          setForgeMode,
          currentMode: forgeMode,
          currentModeLabel: modeLabel,
          contextManager,
          chatStyle,
          setChatStyle,
          handleSuspend,
          openGitMenu: () => setShowGitMenu(true),
          openEditorWithFile,
          setSessionConfig,
          effectiveNvimConfig: effectiveConfig.nvimConfig,
          openSetup: () => setShowSetup(true),
          openEditorSettings: () => setShowEditorSettings(true),
          openRouterSettings: () => setShowRouterSettings(true),
        });
        return;
      }

      chat.handleSubmit(input);
    },
    [
      chat,
      tabMgr,
      toggleFocus,
      nvimOpen,
      exit,
      cwd,
      git,
      forgeMode,
      modeLabel,
      setForgeMode,
      contextManager,
      chatStyle,
      handleSuspend,
      openEditorWithFile,
      effectiveConfig.nvimConfig,
    ],
  );

  // Global keybindings
  useInput(
    (input, key) => {
      if (key.ctrl && input === "e") {
        toggleFocus();
        return;
      }
      if (key.ctrl && input === "o") {
        setCodeExpanded((prev) => !prev);
        return;
      }
      if (focusMode === "editor") return;

      if (key.ctrl && input === "x") {
        chat.abort();
        return;
      }
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
        chat.setMessages([]);
        chat.setCoreMessages([]);
        chat.setTokenUsage({ prompt: 0, completion: 0, total: 0 });
      }
      if (key.ctrl && input === "d") {
        cycleMode();
      }
      if (key.ctrl && input === "g") {
        setShowGitMenu((prev) => !prev);
      }
      // Ctrl+H sends backspace (0x08) in most terminals
      if ((key.ctrl && input === "h") || key.backspace) {
        setShowHelpPopup((prev) => !prev);
      }
      if (key.ctrl && input === "p") {
        setShowSessionPicker((prev) => !prev);
      }
      if (key.ctrl && input === "r") {
        setShowErrorLog((prev) => !prev);
      }
      // Alt+T: new tab (Ctrl+T is intercepted by many terminals)
      if (key.meta && input === "t") {
        tabMgr.createTab();
      }
      // Alt+W: close tab
      if (key.meta && input === "w") {
        if (tabMgr.tabCount > 1) {
          tabMgr.closeTab(tabMgr.activeTabId);
        }
      }
      // Alt+1–9: switch to tab by index
      if (key.meta && input >= "1" && input <= "9") {
        tabMgr.switchToIndex(Number(input) - 1);
      }
      // Alt+[ / Alt+]: prev/next tab
      if (key.meta && input === "[") {
        tabMgr.prevTab();
      }
      if (key.meta && input === "]") {
        tabMgr.nextTab();
      }
      // PageUp / PageDown for chat scroll (line-based)
      if (key.pageUp) {
        const vh = scrollRef.current?.getViewportHeight() ?? 20;
        scrollRef.current?.scrollBy(-vh);
      }
      if (key.pageDown) {
        const vh = scrollRef.current?.getViewportHeight() ?? 20;
        scrollRef.current?.scrollBy(vh);
      }
    },
    {
      isActive:
        !showLlmSelector &&
        !showSkillSearch &&
        !showGitCommit &&
        !showGitMenu &&
        !showSetup &&
        !showSessionPicker &&
        !showHelpPopup &&
        !showErrorLog &&
        !showEditorSettings &&
        !showRouterSettings,
    },
  );

  // Mouse scroll + click-to-focus (3 lines per tick)
  const handleMouseScroll = useCallback((direction: "up" | "down") => {
    scrollRef.current?.scrollBy(direction === "up" ? -3 : 3);
  }, []);

  const handleMouseClick = useCallback(
    (col: number, _row: number) => {
      if (!editorVisible) return;
      const termWidth = stdout?.columns ?? 80;
      const editorWidth = Math.floor(termWidth * 0.6);
      if (col <= editorWidth) {
        setFocus("editor");
      } else {
        setFocus("chat");
      }
    },
    [editorVisible, stdout?.columns, setFocus],
  );

  useMouse({
    onScroll: handleMouseScroll,
    onClick: handleMouseClick,
    isActive:
      !showLlmSelector &&
      !showSkillSearch &&
      !showGitCommit &&
      !showGitMenu &&
      !showSetup &&
      !showSessionPicker &&
      !showHelpPopup &&
      !showErrorLog &&
      !showEditorSettings &&
      !showRouterSettings,
  });

  const isModalOpen =
    showLlmSelector ||
    showSkillSearch ||
    showGitCommit ||
    showGitMenu ||
    showSetup ||
    showSessionPicker ||
    showHelpPopup ||
    showErrorLog ||
    showEditorSettings ||
    showRouterSettings;

  if (suspended) {
    return <Box height={termHeight} />;
  }

  return (
    <Box flexDirection="column" height={termHeight}>
      {/* Header — SoulForge | model | by ProxySoul */}
      <Box flexShrink={0} width="100%" paddingX={1} justifyContent="space-between" height={1}>
        <Box gap={1} flexShrink={1}>
          <Text color="#9B30FF" bold>
            󰊠 SoulForge
          </Text>
          <Text color="#333">│</Text>
          <TokenDisplay
            prompt={chat.tokenUsage.prompt}
            completion={chat.tokenUsage.completion}
            total={chat.tokenUsage.total}
          />
          <Text color="#333">│</Text>
          <ContextBar
            contextManager={contextManager}
            chatChars={chat.chatChars}
            modelId={chat.activeModel}
          />
          <Text color="#333">│</Text>
          {git.isRepo ? (
            <Text color={git.isDirty ? "#FF8C00" : "#2d5"} wrap="truncate">
              {UI_ICONS.git} {truncate(git.branch ?? "HEAD", 30)}
              {git.isDirty ? "*" : ""}
            </Text>
          ) : (
            <Text color="#333">{UI_ICONS.git} no repo</Text>
          )}
          <Text color="#333">│</Text>
          <Text color="#6A0DAD" wrap="truncate">
            {isProxy ? (
              <>
                <Text color="#8B5CF6">󰌆 </Text>
                <Text color="#555">sub</Text>
                <Text color="#333">·</Text>
                {providerIcon(displayProvider)} {truncate(displayModel, 24)}
              </>
            ) : isGateway ? (
              <>
                <Text color="#555">󰒍 gw</Text>
                <Text color="#333">·</Text>
                {providerIcon(displayProvider)} {truncate(displayModel, 25)}
              </>
            ) : (
              <>
                {providerIcon(displayProvider)} {truncate(displayModel, 32)}
              </>
            )}
          </Text>
          {forgeMode !== "default" && (
            <>
              <Text color="#333">│</Text>
              <Text color={modeColor} bold>
                [{modeLabel}]
              </Text>
            </>
          )}
          {tabMgr.tabCount > 1 && (
            <>
              <Text color="#333">│</Text>
              <Text color="#8B5CF6">
                Tab {String(tabMgr.activeTabIndex + 1)}/{String(tabMgr.tabCount)}
              </Text>
            </>
          )}
        </Box>
        <Text italic>
          <Text color="#333">by </Text>
          <Text color="#9B30FF">Proxy</Text>
          <Text color="#FF0040">Soul</Text>
        </Text>
      </Box>

      {/* Tab bar — only shown when 2+ tabs */}
      <TabBar tabs={tabMgr.tabs} activeTabId={tabMgr.activeTabId} onSwitch={tabMgr.switchTab} />

      {/* System banner — ephemeral notifications between header and chat */}
      <SystemBanner messages={chat.messages} expanded={codeExpanded} />

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
          cursorLine={cursorLine}
          cursorCol={cursorCol}
          onClosed={handleEditorClosed}
        />

        {/* Chat — full width, no border */}
        <Box flexDirection="column" width={editorVisible ? "40%" : "100%"}>
          {/* Messages */}
          {chat.messages.length === 0 && chat.streamSegments.length === 0 ? (
            <Box
              flexDirection="column"
              flexGrow={1}
              flexShrink={1}
              minHeight={0}
              justifyContent="center"
            >
              <Box flexDirection="column" alignItems="center" paddingX={2}>
                <GhostLogo />
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
                <Text color="#333"> </Text>
                <HealthCheck />
              </Box>
            </Box>
          ) : (
            <Box flexDirection="row" flexGrow={1} flexShrink={1} minHeight={0}>
              {/* Chat scroll area */}
              <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0}>
                {isScrolledUp && (
                  <Box height={1} flexShrink={0} justifyContent="center">
                    <Text color="#555">▲ scrolled up — scroll down to return</Text>
                  </Box>
                )}
                <ScrollView
                  ref={scrollRef}
                  flexGrow={1}
                  flexShrink={1}
                  minHeight={0}
                  onScroll={handleScroll}
                  onContentHeightChange={handleContentHeightChange}
                  onViewportSizeChange={handleViewportSizeChange}
                >
                  <CodeExpandedProvider value={codeExpanded}>
                    <Box
                      key="chat-content"
                      flexDirection="column"
                      minHeight={chatViewportHeight}
                      justifyContent="flex-end"
                    >
                      <MessageList
                        messages={(chat.messages.length > 100
                          ? chat.messages.slice(-100)
                          : chat.messages
                        ).filter((m) => m.role !== "system")}
                        chatStyle={chatStyle}
                      />

                      {chat.streamSegments.length > 0 && (
                        <Box paddingX={1} flexShrink={0} marginBottom={1}>
                          <Box
                            flexDirection="column"
                            borderStyle="bold"
                            borderLeft
                            borderTop={false}
                            borderBottom={false}
                            borderRight={false}
                            borderColor="#9B30FF"
                            paddingLeft={1}
                          >
                            <Box>
                              <Text color="#9B30FF">󰚩 Forge</Text>
                            </Box>
                            <StreamSegmentList
                              segments={chat.streamSegments}
                              toolCalls={chat.liveToolCalls}
                            />
                          </Box>
                        </Box>
                      )}
                    </Box>
                  </CodeExpandedProvider>
                </ScrollView>
              </Box>
              {/* Right sidebar — plan + changed files */}
              <RightSidebar
                plan={chat.showPlanPanel ? (chat.activePlan ?? chat.sidebarPlan) : null}
                messages={chat.messages}
                cwd={cwd}
              />
            </Box>
          )}

          {/* Bottom area — PlanReview, QuestionPrompt, or InputBox */}
          {chat.showPlanReview ? (
            <Box flexShrink={0} paddingX={1}>
              <PlanReviewPrompt
                isActive={focusMode === "chat" && !isModalOpen}
                onAccept={() => {
                  chat.setShowPlanReview(false);

                  // Build execution prompt from plan file, or original request + context
                  let executionPrompt: string | null = null;
                  const planPath = join(cwd, ".soulforge", "plan.md");
                  try {
                    const planContent = readFileSync(planPath, "utf-8");
                    executionPrompt = `Execute the following plan step by step. Create a plan checklist and update steps as you go.\n\n${planContent}`;
                  } catch {
                    const originalRequest = chat.planRequest;
                    const lastAssistant = [...chat.messages]
                      .reverse()
                      .find((m) => m.role === "assistant");
                    if (originalRequest) {
                      const ctx = lastAssistant
                        ? `\n\nContext from planning:\n${lastAssistant.content}`
                        : "";
                      executionPrompt = `Implement the following: ${originalRequest}${ctx}`;
                    } else if (lastAssistant) {
                      executionPrompt = `Implement the changes described below:\n\n${lastAssistant.content}`;
                    }
                  }

                  if (!executionPrompt) {
                    chat.setMessages((prev) => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        role: "system",
                        content: "No plan found to execute.",
                        timestamp: Date.now(),
                      },
                    ]);
                    return;
                  }

                  // Exit plan mode
                  chat.setPlanMode(false);
                  chat.setPlanRequest(null);
                  setForgeMode("default");
                  contextManager.setForgeMode("default");

                  chat.setMessages((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      role: "system",
                      content: "Plan accepted — executing...",
                      timestamp: Date.now(),
                    },
                  ]);

                  chat.handleSubmit(executionPrompt);
                }}
                onRevise={(feedback) => {
                  chat.setShowPlanReview(false);
                  chat.handleSubmit(feedback);
                }}
                onCancel={() => {
                  chat.setPlanMode(false);
                  chat.setPlanRequest(null);
                  chat.setShowPlanReview(false);
                  setForgeMode("default");
                  chat.setMessages((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      role: "system",
                      content: "Plan cancelled.",
                      timestamp: Date.now(),
                    },
                  ]);
                }}
              />
            </Box>
          ) : chat.pendingQuestion ? (
            <Box flexShrink={0} paddingX={1}>
              <QuestionPrompt
                question={chat.pendingQuestion}
                isActive={focusMode === "chat" && !isModalOpen}
              />
            </Box>
          ) : (
            <InputBox
              onSubmit={handleInputSubmit}
              isLoading={chat.isLoading}
              isFocused={focusMode === "chat" && !isModalOpen}
              onQueue={(msg) =>
                chat.setMessageQueue((prev) => [...prev, { content: msg, queuedAt: Date.now() }])
              }
              queueCount={chat.messageQueue.length}
            />
          )}
        </Box>

        {/* LLM Selector — inside main content so scrim doesn't cover header/footer */}
        <LlmSelector
          visible={showLlmSelector}
          activeModel={chat.activeModel}
          onSelect={(modelId) => {
            if (routerSlotPicking) {
              // Assign to router slot
              const current = effectiveConfig.taskRouter ?? {
                planning: null,
                coding: null,
                exploration: null,
                default: null,
              };
              const updated = { ...current, [routerSlotPicking]: modelId };
              const newConfig = { ...config, taskRouter: updated };
              saveConfig(newConfig);
              setSessionConfig((prev) => ({ ...prev, taskRouter: updated }));
              setRouterSlotPicking(null);
            } else {
              chat.setActiveModel(modelId);
              chat.setTokenUsage({ prompt: 0, completion: 0, total: 0 });
            }
          }}
          onClose={() => {
            setShowLlmSelector(false);
            setRouterSlotPicking(null);
          }}
        />

        {/* Git Commit Modal */}
        <GitCommitModal
          visible={showGitCommit}
          cwd={cwd}
          coAuthor={chat.coAuthorCommits}
          onClose={() => setShowGitCommit(false)}
          onCommitted={(msg) => {
            chat.setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: "system",
                content: `Committed: ${msg}`,
                timestamp: Date.now(),
              },
            ]);
          }}
          onRefresh={() => {
            git.refresh();
            contextManager.refreshGitContext();
          }}
        />

        {/* Git Menu */}
        <GitMenu
          visible={showGitMenu}
          cwd={cwd}
          onClose={() => setShowGitMenu(false)}
          onCommit={() => {
            setShowGitMenu(false);
            setShowGitCommit(true);
          }}
          onSuspend={handleSuspend}
          onSystemMessage={(msg) => {
            chat.setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "system", content: msg, timestamp: Date.now() },
            ]);
          }}
          onRefresh={() => {
            git.refresh();
            contextManager.refreshGitContext();
          }}
        />

        {/* Session Picker */}
        <SessionPicker
          visible={showSessionPicker}
          cwd={cwd}
          onClose={() => setShowSessionPicker(false)}
          onRestore={chat.restoreSession}
          onSystemMessage={(msg) => {
            chat.setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "system", content: msg, timestamp: Date.now() },
            ]);
          }}
        />

        {/* Skills Search */}
        <SkillSearch
          visible={showSkillSearch}
          contextManager={contextManager}
          onClose={() => setShowSkillSearch(false)}
          onSystemMessage={(msg) => {
            chat.setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "system", content: msg, timestamp: Date.now() },
            ]);
          }}
        />

        {/* Help Popup */}
        <HelpPopup visible={showHelpPopup} onClose={() => setShowHelpPopup(false)} />

        {/* Editor Settings */}
        <EditorSettings
          visible={showEditorSettings}
          settings={effectiveConfig.editorIntegration}
          onUpdate={(settings: EditorIntegration) => {
            setSessionConfig((prev) => ({ ...prev, editorIntegration: settings }));
            saveConfig({ ...config, editorIntegration: settings });
          }}
          onClose={() => setShowEditorSettings(false)}
        />

        {/* Router Settings */}
        <RouterSettings
          visible={showRouterSettings && !routerSlotPicking}
          router={effectiveConfig.taskRouter}
          activeModel={chat.activeModel}
          onPickSlot={(slot) => {
            setRouterSlotPicking(slot);
            setShowLlmSelector(true);
          }}
          onClearSlot={(slot) => {
            const current = effectiveConfig.taskRouter ?? {
              planning: null,
              coding: null,
              exploration: null,
              default: null,
            };
            const updated = { ...current, [slot]: null };
            const newConfig = { ...config, taskRouter: updated };
            saveConfig(newConfig);
            setSessionConfig((prev) => ({ ...prev, taskRouter: updated }));
          }}
          onClose={() => setShowRouterSettings(false)}
        />

        {/* Setup Guide */}
        <SetupGuide
          visible={showSetup}
          onClose={() => setShowSetup(false)}
          onSystemMessage={(msg) => {
            chat.setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "system", content: msg, timestamp: Date.now() },
            ]);
          }}
        />

        {/* Error Log */}
        <ErrorLog
          visible={showErrorLog}
          messages={chat.messages}
          onClose={() => setShowErrorLog(false)}
        />
      </Box>

      {/* Footer — branding + shortcuts */}
      <Box flexShrink={0} width="100%">
        <Footer />
      </Box>
    </Box>
  );
}
