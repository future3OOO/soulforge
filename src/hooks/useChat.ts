import type { ModelMessage } from "ai";
import { generateText, stepCountIs, ToolLoopAgent } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StreamSegment } from "../components/StreamSegmentList.js";
import type { LiveToolCall } from "../components/ToolCallDisplay.js";
import { createForgeAgent } from "../core/agents/index.js";
import { buildSubagentTools } from "../core/agents/subagent-tools.js";
import type { ContextManager } from "../core/context/manager.js";
import { setCoAuthorEnabled } from "../core/git/status.js";
import { getModelContextWindow } from "../core/llm/models.js";
import { resolveModel } from "../core/llm/provider.js";
import { buildProviderOptions } from "../core/llm/provider-options.js";
import { detectTaskType, resolveTaskModel } from "../core/llm/task-router.js";
import { SessionManager } from "../core/sessions/manager.js";
import { createThinkingParser } from "../core/thinking-parser.js";
import { buildInteractiveTools, buildPlanModeTools } from "../core/tools/index.js";
import type {
  AppConfig,
  ChatMessage,
  InteractiveCallbacks,
  MessageSegment,
  PendingQuestion,
  Plan,
  PlanStepStatus,
  QueuedMessage,
} from "../types/index.js";

function safeParseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ─── Types ───

export interface TabState {
  id: string;
  label: string;
  messages: ChatMessage[];
  coreMessages: ModelMessage[];
  activeModel: string;
  activePlan: Plan | null;
  sidebarPlan: Plan | null;
  showPlanPanel: boolean;
  tokenUsage: { prompt: number; completion: number; total: number };
  coAuthorCommits: boolean;
  sessionId: string;
  planMode: boolean;
  planRequest: string | null;
}

export interface UseChatOptions {
  effectiveConfig: AppConfig;
  contextManager: ContextManager;
  sessionManager: SessionManager;
  cwd: string;
  openEditorWithFile: (file: string) => void;
  openEditor: () => void;
  onSuspend: (opts: { command: string; args?: string[]; noAltScreen?: boolean }) => void;
  initialState?: TabState;
}

export interface ChatInstance {
  // State
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  coreMessages: ModelMessage[];
  setCoreMessages: React.Dispatch<React.SetStateAction<ModelMessage[]>>;
  isLoading: boolean;
  streamSegments: StreamSegment[];
  liveToolCalls: LiveToolCall[];
  activePlan: Plan | null;
  setActivePlan: React.Dispatch<React.SetStateAction<Plan | null>>;
  sidebarPlan: Plan | null;
  setSidebarPlan: React.Dispatch<React.SetStateAction<Plan | null>>;
  showPlanPanel: boolean;
  setShowPlanPanel: React.Dispatch<React.SetStateAction<boolean>>;
  pendingQuestion: PendingQuestion | null;
  setPendingQuestion: React.Dispatch<React.SetStateAction<PendingQuestion | null>>;
  messageQueue: QueuedMessage[];
  setMessageQueue: React.Dispatch<React.SetStateAction<QueuedMessage[]>>;
  activeModel: string;
  setActiveModel: React.Dispatch<React.SetStateAction<string>>;
  coAuthorCommits: boolean;
  setCoAuthorCommits: React.Dispatch<React.SetStateAction<boolean>>;
  tokenUsage: { prompt: number; completion: number; total: number };
  setTokenUsage: React.Dispatch<
    React.SetStateAction<{ prompt: number; completion: number; total: number }>
  >;
  chatChars: number;
  sessionId: string;
  planMode: boolean;
  planRequest: string | null;
  // Actions
  handleSubmit: (input: string) => Promise<void>;
  summarizeConversation: () => Promise<void>;
  abort: () => void;
  interactiveCallbacks: InteractiveCallbacks;
  // Plan mode
  setPlanMode: (on: boolean) => void;
  setPlanRequest: (req: string | null) => void;
  showPlanReview: boolean;
  setShowPlanReview: React.Dispatch<React.SetStateAction<boolean>>;
  // Snapshot / restore for tab switching
  snapshot: (label: string) => TabState;
  restore: (state: TabState) => void;
  // Session
  restoreSession: (sessionId: string) => void;
}

export function useChat({
  effectiveConfig,
  contextManager,
  sessionManager,
  cwd,
  openEditorWithFile,
  openEditor,
  initialState,
}: UseChatOptions): ChatInstance {
  const [messages, setMessages] = useState<ChatMessage[]>(initialState?.messages ?? []);
  const [coreMessages, setCoreMessages] = useState<ModelMessage[]>(
    initialState?.coreMessages ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [streamSegments, setStreamSegments] = useState<StreamSegment[]>([]);
  const [liveToolCalls, setLiveToolCalls] = useState<LiveToolCall[]>([]);

  // Interactive state
  const abortRef = useRef<AbortController | null>(null);
  const [activePlan, setActivePlan] = useState<Plan | null>(initialState?.activePlan ?? null);
  const [sidebarPlan, setSidebarPlan] = useState<Plan | null>(initialState?.sidebarPlan ?? null);
  const [showPlanPanel, setShowPlanPanel] = useState(initialState?.showPlanPanel ?? true);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);

  // LLM state
  const [activeModel, setActiveModel] = useState(
    initialState?.activeModel ?? effectiveConfig.defaultModel,
  );
  const [coAuthorCommits, setCoAuthorCommits] = useState(initialState?.coAuthorCommits ?? true);

  // Sync co-author flag with git module
  useEffect(() => {
    setCoAuthorEnabled(coAuthorCommits);
  }, [coAuthorCommits]);

  const [tokenUsage, setTokenUsage] = useState(
    initialState?.tokenUsage ?? { prompt: 0, completion: 0, total: 0 },
  );
  const sessionIdRef = useRef<string>(initialState?.sessionId ?? crypto.randomUUID());

  // Streaming token estimation
  const streamingCharsRef = useRef(0);
  const baseTokenUsageRef = useRef({ prompt: 0, completion: 0, total: 0 });
  const tokenUsageRef = useRef(tokenUsage);
  tokenUsageRef.current = tokenUsage;

  // Plan mode
  const [showPlanReview, setShowPlanReview] = useState(false);
  const planModeRef = useRef(initialState?.planMode ?? false);
  const planRequestRef = useRef<string | null>(initialState?.planRequest ?? null);

  const chatChars = useMemo(
    () =>
      coreMessages.reduce((sum, m) => {
        if (typeof m.content === "string") return sum + m.content.length;
        if (Array.isArray(m.content)) {
          return (
            sum +
            m.content.reduce(
              (s: number, part: unknown) =>
                s +
                (typeof part === "object" && part !== null && "text" in part
                  ? String((part as { text: string }).text).length
                  : JSON.stringify(part).length),
              0,
            )
          );
        }
        return sum;
      }, 0),
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
          id: crypto.randomUUID(),
          role: "system",
          content: `Context compressed. Summary: ${summary}`,
          timestamp: Date.now(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: "Failed to summarize conversation.",
          timestamp: Date.now(),
        },
      ]);
    }
  }, [coreMessages, activeModel]);

  // Auto-summarize when context is getting large (>80% of budget)
  const autoSummarizedRef = useRef(false);
  useEffect(() => {
    const systemChars = contextManager.getContextBreakdown().reduce((sum, s) => sum + s.chars, 0);
    const totalChars = systemChars + chatChars;
    const contextBudgetChars = getModelContextWindow(activeModel) * 4; // ~4 chars/token
    const pct = totalChars / contextBudgetChars;
    if (pct > 0.8 && !autoSummarizedRef.current && coreMessages.length >= 6) {
      autoSummarizedRef.current = true;
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
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
  }, [chatChars, contextManager, coreMessages.length, summarizeConversation, activeModel]);

  // Interactive callbacks for plan/question tools
  const interactiveCallbacks = useMemo<InteractiveCallbacks>(
    () => ({
      onPlanCreate: (plan: Plan) => {
        setActivePlan(plan);
        setSidebarPlan(plan);
        setShowPlanPanel(true);
      },
      onPlanStepUpdate: (stepId: string, status: PlanStepStatus) => {
        const updater = (prev: Plan | null) => {
          if (!prev) return prev;
          return {
            ...prev,
            steps: prev.steps.map((s) => (s.id === stepId ? { ...s, status } : s)),
          };
        };
        setActivePlan(updater);
        setSidebarPlan(updater);
      },
      onAskUser: (question, options, allowSkip) => {
        return new Promise<string>((resolve) => {
          setPendingQuestion({
            id: crypto.randomUUID(),
            question,
            options,
            allowSkip,
            resolve,
          });
        });
      },
      onOpenEditor: async (file?: string) => {
        if (file) {
          openEditorWithFile(file);
        } else {
          openEditor();
        }
      },
      onWebSearchApproval: (query: string) => {
        return new Promise<boolean>((resolve) => {
          setPendingQuestion({
            id: crypto.randomUUID(),
            question: `Forge wants to search the web for:\n\n"${query}"\n\nAllow this search?`,
            options: [
              { label: "✓ Allow", value: "allow", description: "Run the web search" },
              { label: "✗ Deny", value: "deny", description: "Skip the search" },
            ],
            allowSkip: false,
            resolve: (answer) => resolve(answer === "allow"),
          });
        });
      },
    }),
    [openEditor, openEditorWithFile],
  );

  const handleSubmit = useCallback(
    async (input: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: input,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const newCoreMessages: ModelMessage[] = [
        ...coreMessages,
        { role: "user" as const, content: input },
      ];
      setCoreMessages(newCoreMessages);
      setIsLoading(true);
      setStreamSegments([]);
      setLiveToolCalls([]);
      setActivePlan(null);
      setPendingQuestion(null);

      // Capture pre-stream token baseline for live estimation
      streamingCharsRef.current = 0;
      const currentUsage = tokenUsageRef.current;
      baseTokenUsageRef.current = {
        prompt: currentUsage.prompt,
        completion: currentUsage.completion,
        total: currentUsage.total,
      };

      // Abort controller for Ctrl+X
      const abortController = new AbortController();
      abortRef.current = abortController;

      let fullText = "";
      const completedCalls: import("../types/index.js").ToolCall[] = [];
      const finalSegments: MessageSegment[] = [];

      try {
        const taskType = detectTaskType(input);
        const modelId = resolveTaskModel(taskType, effectiveConfig.taskRouter, activeModel);
        const model = resolveModel(modelId);

        // Resolve subagent models from task router
        const tr = effectiveConfig.taskRouter;
        const explorationModelId = tr?.exploration ?? undefined;
        const codingModelId = tr?.coding ?? undefined;
        const subagentModels =
          explorationModelId || codingModelId
            ? {
                exploration: explorationModelId ? resolveModel(explorationModelId) : undefined,
                coding: codingModelId ? resolveModel(codingModelId) : undefined,
              }
            : undefined;

        // Web search approval — only gate when webSearch is enabled (default true)
        const webSearchApproval =
          effectiveConfig.webSearch !== false
            ? interactiveCallbacks.onWebSearchApproval
            : undefined;

        // Build Anthropic-specific providerOptions (thinking, effort, context management)
        const { providerOptions, headers } = buildProviderOptions(
          modelId,
          effectiveConfig,
          taskType,
        );

        const agent = planModeRef.current
          ? new ToolLoopAgent({
              id: "forge-plan",
              model,
              tools: {
                ...buildPlanModeTools(cwd, effectiveConfig.editorIntegration, webSearchApproval),
                dispatch: buildSubagentTools({ defaultModel: model, providerOptions, headers })
                  .dispatch,
                ...(interactiveCallbacks ? buildInteractiveTools(interactiveCallbacks) : {}),
              },
              instructions: contextManager.buildSystemPrompt(),
              stopWhen: stepCountIs(50),
              ...(providerOptions && Object.keys(providerOptions).length > 0
                ? { providerOptions }
                : {}),
              ...(headers ? { headers } : {}),
            })
          : createForgeAgent({
              model,
              contextManager,
              interactive: interactiveCallbacks,
              editorIntegration: effectiveConfig.editorIntegration,
              subagentModels,
              onApproveWebSearch: webSearchApproval,
              providerOptions,
              headers,
              codeExecution: effectiveConfig.codeExecution,
            });
        const result = await agent.stream({
          messages: newCoreMessages,
          abortSignal: abortController.signal,
        });

        const toolCallArgs = new Map<string, string>();
        const thinkingParser = createThinkingParser();
        let hasNativeReasoning = false;
        let thinkingIdCounter = 0;

        // Live token estimation — update completion estimate as chars stream in
        const updateStreamingEstimate = (newChars: number) => {
          streamingCharsRef.current += newChars;
          const estimatedNewTokens = Math.round(streamingCharsRef.current / 4);
          const base = baseTokenUsageRef.current;
          setTokenUsage({
            prompt: base.prompt,
            completion: base.completion + estimatedNewTokens,
            total: base.total + estimatedNewTokens,
          });
        };

        // Helpers for accumulating text/reasoning into finalSegments + streamSegments
        const appendText = (text: string) => {
          fullText += text;
          updateStreamingEstimate(text.length);
          const lastSeg = finalSegments[finalSegments.length - 1];
          if (lastSeg?.type === "text") {
            lastSeg.content += text;
          } else {
            finalSegments.push({ type: "text", content: text });
          }
          setStreamSegments((prev) => {
            const last = prev[prev.length - 1];
            if (last?.type === "text") {
              return [
                ...prev.slice(0, -1),
                { type: "text" as const, content: last.content + text },
              ];
            }
            return [...prev, { type: "text" as const, content: text }];
          });
        };

        const pushReasoningSegment = (id: string) => {
          finalSegments.push({ type: "reasoning", content: "", id });
          setStreamSegments((prev) => [...prev, { type: "reasoning" as const, content: "", id }]);
        };

        const appendReasoningContent = (text: string) => {
          updateStreamingEstimate(text.length);
          const lastSeg = finalSegments[finalSegments.length - 1];
          if (lastSeg?.type === "reasoning") {
            lastSeg.content += text;
          }
          setStreamSegments((prev) => {
            const last = prev[prev.length - 1];
            if (last?.type === "reasoning") {
              return [...prev.slice(0, -1), { ...last, content: last.content + text }];
            }
            return prev;
          });
        };

        for await (const part of result.fullStream) {
          switch (part.type) {
            case "reasoning-start": {
              hasNativeReasoning = true;
              const id = (part as { id?: string }).id ?? `reasoning-${String(thinkingIdCounter++)}`;
              pushReasoningSegment(id);
              break;
            }
            case "reasoning-delta": {
              appendReasoningContent((part as { text: string }).text);
              break;
            }
            case "reasoning-end":
              break;
            case "text-delta": {
              if (hasNativeReasoning) {
                appendText(part.text);
              } else {
                const parsed = thinkingParser.feed(part.text);
                for (const chunk of parsed) {
                  switch (chunk.type) {
                    case "text":
                      appendText(chunk.content);
                      break;
                    case "reasoning-start":
                      pushReasoningSegment(`thinking-${String(thinkingIdCounter++)}`);
                      break;
                    case "reasoning-content":
                      appendReasoningContent(chunk.content);
                      break;
                    case "reasoning-end":
                      break;
                  }
                }
              }
              break;
            }
            case "tool-input-start": {
              const lastToolSeg = finalSegments[finalSegments.length - 1];
              if (lastToolSeg?.type === "tools") {
                lastToolSeg.toolCallIds.push(part.id);
              } else {
                finalSegments.push({ type: "tools", toolCallIds: [part.id] });
              }
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
            }
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
                args: safeParseArgs(toolCallArgs.get(part.toolCallId)),
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
                args: safeParseArgs(toolCallArgs.get(part.toolCallId)),
                result: { success: false, output: "", error: String(part.error) },
              });
              break;
            case "finish-step": {
              const su = part.usage as { inputTokens?: number; outputTokens?: number } | undefined;
              const stepIn = su?.inputTokens ?? 0;
              const stepOut = su?.outputTokens ?? 0;
              // Snap to real token counts from the API, replacing estimates
              const base = baseTokenUsageRef.current;
              const newUsage = {
                prompt: base.prompt + stepIn,
                completion: base.completion + stepOut,
                total: base.total + stepIn + stepOut,
              };
              setTokenUsage(newUsage);
              // Update baseline for next step in multi-step tool loops
              baseTokenUsageRef.current = newUsage;
              streamingCharsRef.current = 0;
              break;
            }
            case "error": {
              const ep = part as Record<string, unknown>;
              const errText =
                (typeof ep.errorText === "string" && ep.errorText) ||
                (ep.error instanceof Error ? ep.error.message : null) ||
                (typeof ep.error === "string" ? ep.error : null) ||
                JSON.stringify(ep);
              appendText(`\n\n_Error: ${errText}_`);
              break;
            }
          }
        }

        // Flush any buffered partial tags from the thinking parser
        if (!hasNativeReasoning) {
          for (const chunk of thinkingParser.flush()) {
            switch (chunk.type) {
              case "text":
                appendText(chunk.content);
                break;
              case "reasoning-content":
                appendReasoningContent(chunk.content);
                break;
              default:
                break;
            }
          }
        }

        let responseMessages: ModelMessage[];
        try {
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("response timeout")), 10_000),
          );
          const responseData = await Promise.race([result.response, timeout]);
          responseMessages = responseData.messages;
        } catch {
          responseMessages =
            fullText.length > 0 ? [{ role: "assistant" as const, content: fullText }] : [];
        }

        // Embed plan as a segment if one was created
        setActivePlan((currentPlan) => {
          if (currentPlan) {
            finalSegments.push({ type: "plan", plan: currentPlan });
          }
          return null;
        });

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: fullText,
          timestamp: Date.now(),
          toolCalls: completedCalls.length > 0 ? completedCalls : undefined,
          segments: finalSegments.length > 0 ? finalSegments : undefined,
        };

        setMessages((prev) => {
          const next = [...prev, assistantMsg];
          const updatedCore: ModelMessage[] = [
            ...coreMessages,
            { role: "user" as const, content: input },
            ...responseMessages,
          ];
          sessionManager.saveSession({
            id: sessionIdRef.current,
            title: SessionManager.deriveTitle(next),
            messages: next.filter((m) => m.role !== "system"),
            coreMessages: updatedCore,
            cwd,
            startedAt: next[0]?.timestamp ?? Date.now(),
            updatedAt: Date.now(),
          });
          return next;
        });
        setCoreMessages((prev) => [...prev, ...responseMessages]);
        setStreamSegments([]);
        setLiveToolCalls([]);
      } catch (err: unknown) {
        const isAbort = abortController.signal.aborted;
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (fullText.trim().length > 0 || completedCalls.length > 0) {
          const partialMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: fullText,
            timestamp: Date.now(),
            toolCalls: completedCalls.length > 0 ? completedCalls : undefined,
            segments: finalSegments.length > 0 ? finalSegments : undefined,
          };
          setMessages((prev) => [...prev, partialMsg]);
          setCoreMessages((prev) => [...prev, { role: "assistant" as const, content: fullText }]);
        }
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "system",
            content: isAbort ? "Generation interrupted." : `Error: ${errorMsg}`,
            timestamp: Date.now(),
          },
        ]);
        setStreamSegments([]);
        setLiveToolCalls([]);
      } finally {
        setIsLoading(false);
        abortRef.current = null;
        setPendingQuestion(null);
        setActivePlan(null);
        contextManager.invalidateFileTree();

        // In plan mode, populate sidebar from structured write_plan data + show review
        if (planModeRef.current) {
          const writePlanCall = completedCalls.find(
            (c) => c.name === "write_plan" && c.result?.success,
          );
          if (writePlanCall && Array.isArray(writePlanCall.args.steps)) {
            const planSteps = writePlanCall.args.steps as Array<{
              id: string;
              label: string;
            }>;
            const sidebarData: Plan = {
              title: String(writePlanCall.args.title ?? "Plan"),
              steps: planSteps.map((s) => ({
                id: s.id,
                label: s.label,
                status: "pending" as const,
              })),
              createdAt: Date.now(),
            };
            setSidebarPlan(sidebarData);
            setShowPlanPanel(true);
          }
          setShowPlanReview(true);
        } else {
          // Process message queue
          setMessageQueue((queue) => {
            if (queue.length > 0) {
              const [next, ...rest] = queue;
              if (next) {
                setTimeout(() => handleSubmit(next.content), 0);
              }
              return rest;
            }
            return queue;
          });
        }
      }
    },
    [
      coreMessages,
      activeModel,
      contextManager,
      sessionManager,
      interactiveCallbacks,
      cwd,
      effectiveConfig,
    ],
  );

  const abort = useCallback(() => {
    if (abortRef.current) {
      if (pendingQuestion) {
        pendingQuestion.resolve("__skipped__");
        setPendingQuestion(null);
      }
      setActivePlan(null);
      abortRef.current.abort();
    }
  }, [pendingQuestion]);

  // Snapshot current state for tab switching
  const snapshot = useCallback(
    (label: string): TabState => ({
      id: sessionIdRef.current,
      label,
      messages,
      coreMessages,
      activeModel,
      activePlan,
      sidebarPlan,
      showPlanPanel,
      tokenUsage,
      coAuthorCommits,
      sessionId: sessionIdRef.current,
      planMode: planModeRef.current,
      planRequest: planRequestRef.current,
    }),
    [
      messages,
      coreMessages,
      activeModel,
      activePlan,
      sidebarPlan,
      showPlanPanel,
      tokenUsage,
      coAuthorCommits,
    ],
  );

  // Restore state from a tab snapshot
  const restore = useCallback((state: TabState) => {
    setMessages(state.messages);
    setCoreMessages(state.coreMessages);
    setActiveModel(state.activeModel);
    setActivePlan(state.activePlan);
    setSidebarPlan(state.sidebarPlan);
    setShowPlanPanel(state.showPlanPanel);
    setTokenUsage(state.tokenUsage);
    setCoAuthorCommits(state.coAuthorCommits);
    sessionIdRef.current = state.sessionId;
    planModeRef.current = state.planMode;
    planRequestRef.current = state.planRequest;
    // Reset transient state
    setStreamSegments([]);
    setLiveToolCalls([]);
    setPendingQuestion(null);
    setMessageQueue([]);
    setShowPlanReview(false);
    setIsLoading(false);
    autoSummarizedRef.current = false;
  }, []);

  // Restore a session from disk
  const restoreSession = useCallback(
    (sessionId: string) => {
      const session = sessionManager.loadSession(sessionId);
      if (!session) return;
      sessionIdRef.current = session.id;
      setMessages(session.messages);
      setCoreMessages(session.coreMessages);
      setStreamSegments([]);
      setLiveToolCalls([]);
      setTokenUsage({ prompt: 0, completion: 0, total: 0 });
    },
    [sessionManager],
  );

  const setPlanMode = useCallback((on: boolean) => {
    planModeRef.current = on;
  }, []);

  const setPlanRequest = useCallback((req: string | null) => {
    planRequestRef.current = req;
  }, []);

  return {
    messages,
    setMessages,
    coreMessages,
    setCoreMessages,
    isLoading,
    streamSegments,
    liveToolCalls,
    activePlan,
    setActivePlan,
    sidebarPlan,
    setSidebarPlan,
    showPlanPanel,
    setShowPlanPanel,
    pendingQuestion,
    setPendingQuestion,
    messageQueue,
    setMessageQueue,
    activeModel,
    setActiveModel,
    coAuthorCommits,
    setCoAuthorCommits,
    tokenUsage,
    setTokenUsage,
    chatChars,
    sessionId: sessionIdRef.current,
    planMode: planModeRef.current,
    planRequest: planRequestRef.current,
    handleSubmit,
    summarizeConversation,
    abort,
    interactiveCallbacks,
    setPlanMode,
    setPlanRequest,
    showPlanReview,
    setShowPlanReview,
    snapshot,
    restore,
    restoreSession,
  };
}
