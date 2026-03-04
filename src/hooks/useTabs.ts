import { useCallback, useRef, useState } from "react";
import type { ChatInstance, TabState } from "./useChat.js";

const MAX_TABS = 9;

export interface Tab {
  id: string;
  label: string;
}

export interface UseTabsReturn {
  tabs: Tab[];
  activeTabId: string;
  activeTab: Tab;
  tabCount: number;
  activeTabIndex: number;
  createTab: () => void;
  closeTab: (id: string) => boolean;
  switchTab: (id: string) => void;
  switchToIndex: (index: number) => void;
  nextTab: () => void;
  prevTab: () => void;
  renameTab: (id: string, label: string) => void;
  moveTab: (id: string, direction: "left" | "right") => void;
  /** Derive tab label from first user message */
  autoLabel: (id: string, firstMessage: string) => void;
  /** Get frozen state for all tabs (for persistence) */
  getAllTabStates: () => TabState[];
}

interface UseTabsOptions {
  chat: ChatInstance;
  defaultModel: string;
}

export function useTabs({ chat, defaultModel }: UseTabsOptions): UseTabsReturn {
  const initialId = useRef(crypto.randomUUID()).current;
  const [tabs, setTabs] = useState<Tab[]>([{ id: initialId, label: "Tab 1" }]);
  const [activeTabId, setActiveTabId] = useState<string>(initialId);
  const tabCounter = useRef(1);

  // Frozen states for inactive tabs
  const frozenStates = useRef(new Map<string, TabState>());
  // Track whether each tab has been auto-labeled
  const autoLabeled = useRef(new Set<string>());

  // biome-ignore lint/style/noNonNullAssertion: tabs always has at least one element
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]!;
  const activeTabIndex = tabs.findIndex((t) => t.id === activeTabId);

  const switchTab = useCallback(
    (targetId: string) => {
      if (targetId === activeTabId) return;
      if (!tabs.some((t) => t.id === targetId)) return;

      // Freeze current tab
      const currentLabel = tabs.find((t) => t.id === activeTabId)?.label ?? "Tab";
      frozenStates.current.set(activeTabId, chat.snapshot(currentLabel));

      // Restore target tab
      const targetState = frozenStates.current.get(targetId);
      if (targetState) {
        chat.restore(targetState);
        frozenStates.current.delete(targetId);
      } else {
        // New tab with no state — clear chat
        chat.restore({
          id: targetId,
          label: tabs.find((t) => t.id === targetId)?.label ?? "Tab",
          messages: [],
          coreMessages: [],
          activeModel: defaultModel,
          activePlan: null,
          sidebarPlan: null,
          showPlanPanel: true,
          tokenUsage: { prompt: 0, completion: 0, total: 0 },
          coAuthorCommits: true,
          sessionId: targetId,
          planMode: false,
          planRequest: null,
        });
      }

      setActiveTabId(targetId);
    },
    [activeTabId, tabs, chat, defaultModel],
  );

  const createTab = useCallback(() => {
    if (tabs.length >= MAX_TABS) return;

    tabCounter.current += 1;
    const newId = crypto.randomUUID();
    const newLabel = `Tab ${String(tabCounter.current)}`;

    setTabs((prev) => [...prev, { id: newId, label: newLabel }]);

    // Freeze current tab and switch to new
    const currentLabel = tabs.find((t) => t.id === activeTabId)?.label ?? "Tab";
    frozenStates.current.set(activeTabId, chat.snapshot(currentLabel));

    // Initialize new tab with clean state
    chat.restore({
      id: newId,
      label: newLabel,
      messages: [],
      coreMessages: [],
      activeModel: defaultModel,
      activePlan: null,
      sidebarPlan: null,
      showPlanPanel: true,
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      coAuthorCommits: true,
      sessionId: newId,
      planMode: false,
      planRequest: null,
    });

    setActiveTabId(newId);
  }, [tabs, activeTabId, chat, defaultModel]);

  const closeTab = useCallback(
    (targetId: string): boolean => {
      if (tabs.length <= 1) return false;

      const idx = tabs.findIndex((t) => t.id === targetId);
      if (idx === -1) return false;

      // Remove frozen state
      frozenStates.current.delete(targetId);
      autoLabeled.current.delete(targetId);

      const newTabs = tabs.filter((t) => t.id !== targetId);
      setTabs(newTabs);

      // If closing active tab, switch to neighbor
      if (targetId === activeTabId) {
        const newIdx = Math.min(idx, newTabs.length - 1);
        const newActiveId = newTabs[newIdx]?.id ?? newTabs[0]?.id ?? "";

        const targetState = frozenStates.current.get(newActiveId);
        if (targetState) {
          chat.restore(targetState);
          frozenStates.current.delete(newActiveId);
        }

        setActiveTabId(newActiveId);
      }

      return true;
    },
    [tabs, activeTabId, chat],
  );

  const switchToIndex = useCallback(
    (index: number) => {
      const tab = tabs[index];
      if (tab) switchTab(tab.id);
    },
    [tabs, switchTab],
  );

  const nextTab = useCallback(() => {
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const nextIdx = (idx + 1) % tabs.length;
    const tab = tabs[nextIdx];
    if (tab) switchTab(tab.id);
  }, [tabs, activeTabId, switchTab]);

  const prevTab = useCallback(() => {
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const prevIdx = (idx - 1 + tabs.length) % tabs.length;
    const tab = tabs[prevIdx];
    if (tab) switchTab(tab.id);
  }, [tabs, activeTabId, switchTab]);

  const renameTab = useCallback((id: string, label: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, label } : t)));
    autoLabeled.current.add(id);
  }, []);

  const moveTab = useCallback((id: string, direction: "left" | "right") => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === "left" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      const a = next[idx];
      const b = next[newIdx];
      if (a && b) {
        next[idx] = b;
        next[newIdx] = a;
      }
      return next;
    });
  }, []);

  const autoLabel = useCallback((id: string, firstMessage: string) => {
    if (autoLabeled.current.has(id)) return;
    autoLabeled.current.add(id);
    const label = firstMessage.trim().slice(0, 20) || "Tab";
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, label } : t)));
  }, []);

  const getAllTabStates = useCallback((): TabState[] => {
    const states: TabState[] = [];
    for (const tab of tabs) {
      if (tab.id === activeTabId) {
        states.push(chat.snapshot(tab.label));
      } else {
        const frozen = frozenStates.current.get(tab.id);
        if (frozen) {
          states.push(frozen);
        }
      }
    }
    return states;
  }, [tabs, activeTabId, chat]);

  return {
    tabs,
    activeTabId,
    activeTab,
    tabCount: tabs.length,
    activeTabIndex,
    createTab,
    closeTab,
    switchTab,
    switchToIndex,
    nextTab,
    prevTab,
    renameTab,
    moveTab,
    autoLabel,
    getAllTabStates,
  };
}
