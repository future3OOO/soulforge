import { relative } from "node:path";
import { create } from "zustand";
import { getWorkspaceCoordinator } from "../core/coordination/WorkspaceCoordinator.js";
import { run as gitRun } from "../core/git/status.js";
import type { ChatMessage } from "../types/index.js";

// ── Types ──

export interface Checkpoint {
  index: number;
  /** First line of user prompt, truncated to 60 chars */
  promptPreview: string;
  prompt: string;
  /** ID of the user message that started this checkpoint */
  anchorMessageId: string;
  startedAt: number;
  durationMs: number;
  filesRead: string[];
  filesEdited: string[];
  lineDelta: [number, number];
  gitTag: string | null;
  status: "running" | "done" | "error";
  /** Messages from conversation start through this checkpoint */
  messagesSnapshot: ChatMessage[];
  /** True when this checkpoint has been undone */
  undone: boolean;
}

export interface FileConflict {
  path: string;
  ownerTabId: string;
  ownerTabLabel: string;
}

export interface UndoResult {
  messages: ChatMessage[];
  restoredFiles: string[];
  conflicts: FileConflict[];
}

export interface RedoResult {
  messages: ChatMessage[];
  restoredFiles: string[];
}

// ── Constants ──

const EDIT_TOOLS = new Set([
  "edit_file",
  "multi_edit",
  "rename_file",
  "rename_symbol",
  "move_symbol",
  "refactor",
  "undo_edit",
]);

const READ_TOOLS = new Set([
  "Read",
  "soul_grep",
  "navigate",
  "Grep",
  "Glob",
  "soul_find",
  "soul_analyze",
  "analyze",
]);

function slugify(text: string, maxLen = 30): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen);
}

function makeTagName(tabId: string, index: number, prompt: string): string {
  const slug = slugify(prompt);
  return `soulforge/cp-${tabId.slice(0, 8)}-${String(index)}-${slug}`;
}

function extractFilesFromToolCalls(msg: ChatMessage): { read: string[]; edited: string[] } {
  const read: string[] = [];
  const edited: string[] = [];
  if (!msg.toolCalls) return { read, edited };

  for (const tc of msg.toolCalls) {
    if (EDIT_TOOLS.has(tc.name) && tc.result?.success) {
      const p = tc.args.path ?? tc.args.file;
      if (typeof p === "string") edited.push(p);
      // rename_file has from/to
      if (typeof tc.args.from === "string") edited.push(tc.args.from);
      if (typeof tc.args.to === "string" && tc.name === "rename_file") edited.push(tc.args.to);
      // multi_edit path
      if (tc.name === "multi_edit" && typeof tc.args.path === "string") {
        if (!edited.includes(tc.args.path as string)) edited.push(tc.args.path as string);
      }
    }
    if (READ_TOOLS.has(tc.name)) {
      const p = tc.args.path ?? tc.args.file;
      if (typeof p === "string") read.push(p);
      // Read tool can have files array
      if (Array.isArray(tc.args.files)) {
        for (const f of tc.args.files) {
          if (typeof f === "object" && f && typeof (f as { path?: string }).path === "string") {
            read.push((f as { path: string }).path);
          }
        }
      }
    }
    // dispatch results
    if (tc.name === "dispatch" && tc.result?.filesEdited) {
      for (const f of tc.result.filesEdited as string[]) edited.push(f);
    }
  }
  return { read: [...new Set(read)], edited: [...new Set(edited)] };
}

// ── Store ──

interface PerTab {
  checkpoints: Checkpoint[];
  viewing: number | null; // null = live
  redoStack: Checkpoint[];
  lastSyncedLen: number;
}

interface CheckpointState {
  tabs: Record<string, PerTab>;
  skipCleanupTabs: Set<string>;

  // Sync
  syncFromMessages(tabId: string, messages: ChatMessage[], isLoading: boolean): void;

  // Browsing
  setViewing(tabId: string, index: number | null): void;
  getViewing(tabId: string): number | null;
  getCheckpoints(tabId: string): Checkpoint[];
  getTab(tabId: string): PerTab;

  // Git operations
  createGitTag(tabId: string, index: number, cwd: string): Promise<boolean>;
  undoToCheckpoint(tabId: string, index: number, cwd: string): Promise<UndoResult | null>;
  redo(tabId: string, cwd: string): Promise<RedoResult | null>;
  canRedo(tabId: string): boolean;
  getRedoCount(tabId: string): number;

  // Session persistence
  restoreTagsFromMeta(
    tabId: string,
    tags: Array<{ index: number; anchorMessageId: string; gitTag: string }>,
  ): void;
  skipCleanup(tabId: string): void;
  shouldSkipCleanup(tabId: string): boolean;

  // Cleanup
  cleanupGitTags(tabId: string, cwd: string): Promise<void>;
  clear(tabId: string): void;
}

function emptyTab(): PerTab {
  return { checkpoints: [], viewing: null, redoStack: [], lastSyncedLen: 0 };
}

function getOrCreate(tabs: Record<string, PerTab>, tabId: string): PerTab {
  return tabs[tabId] ?? emptyTab();
}

export const useCheckpointStore = create<CheckpointState>()((set, get) => ({
  tabs: {},
  skipCleanupTabs: new Set(),

  syncFromMessages(tabId: string, messages: ChatMessage[], isLoading: boolean) {
    const state = get();
    const tab = getOrCreate(state.tabs, tabId);

    // Rebuild checkpoints from scratch — messages can be mutated (trimmed, compacted)
    // so incremental sync is unreliable. This is cheap: just scanning message roles.
    const checkpoints: Checkpoint[] = [];
    let current: Checkpoint | null = null;

    for (const msg of messages) {
      if (msg.role === "user" && !msg.isSteering) {
        // Finalize previous checkpoint
        if (current) {
          if (current.status === "running") current.status = "done";
          if (current.startedAt && current.status === "done") {
            current.durationMs = msg.timestamp - current.startedAt;
          }
        }
        const preview = msg.content.split("\n")[0]?.slice(0, 60) ?? "";
        current = {
          index: checkpoints.length + 1,
          promptPreview: preview,
          prompt: msg.content,
          anchorMessageId: msg.id,
          startedAt: msg.timestamp,
          durationMs: 0,
          filesRead: [],
          filesEdited: [],
          lineDelta: [0, 0],
          gitTag: null,
          status: "running",
          messagesSnapshot: [],
          undone: false,
        };
        checkpoints.push(current);
      }

      if (msg.role === "assistant" && current) {
        const { read, edited } = extractFilesFromToolCalls(msg);
        for (const f of read) {
          if (!current.filesRead.includes(f)) current.filesRead.push(f);
        }
        for (const f of edited) {
          if (!current.filesEdited.includes(f)) current.filesEdited.push(f);
        }
      }

      // Steering messages fold into current checkpoint
      if (msg.role === "user" && msg.isSteering && current) {
        // Don't start a new checkpoint — just continue
      }
    }

    // Finalize last checkpoint
    if (current) {
      if (!isLoading && current.status === "running") {
        current.status = "done";
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && current.startedAt) {
          current.durationMs = lastMsg.timestamp - current.startedAt;
        }
      }
    }

    // Build message snapshots
    let cpIdx = 0;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg) continue;
      if (msg.role === "user" && !msg.isSteering) cpIdx++;
      const cp = checkpoints[cpIdx - 1];
      if (cp) cp.messagesSnapshot = messages.slice(0, i + 1);
    }
    // Ensure last checkpoint has full snapshot if still running
    if (current && current.status === "running") {
      current.messagesSnapshot = [...messages];
    }

    // Preserve git tags from previous state
    for (const cp of checkpoints) {
      const prev = tab.checkpoints.find(
        (p) => p.index === cp.index && p.anchorMessageId === cp.anchorMessageId,
      );
      if (prev?.gitTag) cp.gitTag = prev.gitTag;
    }

    // Preserve undone state from previous state
    for (const cp of checkpoints) {
      const prev = tab.checkpoints.find((p) => p.anchorMessageId === cp.anchorMessageId);
      if (prev?.undone) cp.undone = true;
    }

    // Clear redo stack if new checkpoints appeared (user sent a new message after undo)
    const hasNewCheckpoints = checkpoints.some(
      (cp) => !cp.undone && !tab.checkpoints.find((p) => p.anchorMessageId === cp.anchorMessageId),
    );
    const redoStack = hasNewCheckpoints ? [] : tab.redoStack;

    set({
      tabs: {
        ...state.tabs,
        [tabId]: {
          ...tab,
          checkpoints,
          redoStack,
          lastSyncedLen: messages.length,
        },
      },
    });
  },

  setViewing(tabId: string, index: number | null) {
    const state = get();
    const tab = getOrCreate(state.tabs, tabId);
    set({
      tabs: {
        ...state.tabs,
        [tabId]: { ...tab, viewing: index },
      },
    });
  },

  getViewing(tabId: string): number | null {
    return get().tabs[tabId]?.viewing ?? null;
  },

  getCheckpoints(tabId: string): Checkpoint[] {
    return get().tabs[tabId]?.checkpoints ?? [];
  },

  getTab(tabId: string): PerTab {
    return get().tabs[tabId] ?? emptyTab();
  },

  async createGitTag(tabId: string, index: number, cwd: string): Promise<boolean> {
    const tab = getOrCreate(get().tabs, tabId);
    const cp = tab.checkpoints.find((c) => c.index === index);
    if (!cp || cp.gitTag) return false;

    const tag = makeTagName(tabId, index, cp.prompt);

    // git add -A && git commit -m "soulforge-cp" && git tag <name> && git reset HEAD~1 --mixed
    const add = await gitRun(["add", "-A"], cwd);
    if (!add.ok) return false;

    const commit = await gitRun(
      ["commit", "-m", `soulforge-cp-${String(index)}`, "--allow-empty"],
      cwd,
    );
    if (!commit.ok) return false;

    const tagResult = await gitRun(["tag", tag], cwd);
    if (!tagResult.ok) {
      // Rollback the commit
      await gitRun(["reset", "HEAD~1", "--mixed"], cwd);
      return false;
    }

    // Reset back — the tag preserves the snapshot
    await gitRun(["reset", "HEAD~1", "--mixed"], cwd);

    // Re-read fresh state after async ops to avoid overwriting concurrent syncs
    set((s) => {
      const freshTab = s.tabs[tabId];
      if (!freshTab) return s;
      const updatedCheckpoints = freshTab.checkpoints.map((c) =>
        c.index === index && c.anchorMessageId === cp.anchorMessageId ? { ...c, gitTag: tag } : c,
      );
      return {
        tabs: { ...s.tabs, [tabId]: { ...freshTab, checkpoints: updatedCheckpoints } },
      };
    });
    return true;
  },

  async undoToCheckpoint(
    tabId: string,
    targetIndex: number,
    cwd: string,
  ): Promise<UndoResult | null> {
    const state = get();
    const tab = getOrCreate(state.tabs, tabId);
    const targetCp = tab.checkpoints.find((c) => c.index === targetIndex);
    if (!targetCp) return null;

    // Collect all checkpoints after target that will be undone
    const toUndo = tab.checkpoints.filter((c) => c.index > targetIndex && !c.undone);
    if (toUndo.length === 0) return null;

    // Collect all files that need reverting
    const filesToRevert = new Set<string>();
    for (const cp of toUndo) {
      for (const f of cp.filesEdited) filesToRevert.add(f);
    }

    // Check conflicts with other tabs
    const coordinator = getWorkspaceCoordinator();
    const conflicts: FileConflict[] = [];
    for (const filePath of filesToRevert) {
      const fileConflicts = coordinator.getConflicts(tabId, [filePath]);
      for (const c of fileConflicts) {
        conflicts.push({
          path: c.path,
          ownerTabId: c.ownerTabId,
          ownerTabLabel: c.ownerTabLabel,
        });
      }
    }

    // Restore files from the target checkpoint's git tag
    const restoredFiles: string[] = [];
    if (targetCp.gitTag && filesToRevert.size > 0) {
      const { writeFile } = await import("node:fs/promises");
      for (const absPath of filesToRevert) {
        const relPath = relative(cwd, absPath);
        const result = await gitRun(["show", `${targetCp.gitTag}:${relPath}`], cwd, 10_000);
        if (result.ok) {
          await writeFile(absPath, result.stdout);
          restoredFiles.push(absPath);
        }
      }
    }

    // Mark checkpoints as undone, push to redo stack
    const newCheckpoints = tab.checkpoints.map((cp) =>
      cp.index > targetIndex ? { ...cp, undone: true } : cp,
    );
    const newRedoStack = [...tab.redoStack, ...toUndo.map((cp) => ({ ...cp }))];

    // The messages to keep = target checkpoint's snapshot
    const messages = targetCp.messagesSnapshot;

    set({
      tabs: {
        ...state.tabs,
        [tabId]: {
          ...tab,
          checkpoints: newCheckpoints,
          redoStack: newRedoStack,
          viewing: null, // back to live
        },
      },
    });

    return { messages, restoredFiles, conflicts };
  },

  async redo(tabId: string, cwd: string): Promise<RedoResult | null> {
    const state = get();
    const tab = getOrCreate(state.tabs, tabId);
    if (tab.redoStack.length === 0) return null;

    // Pop the last undone checkpoint
    const toRedo = tab.redoStack[tab.redoStack.length - 1];
    if (!toRedo) return null;
    const newRedoStack = tab.redoStack.slice(0, -1);

    // Restore files from the redo checkpoint's git tag
    const restoredFiles: string[] = [];
    if (toRedo.gitTag && toRedo.filesEdited.length > 0) {
      const { writeFile } = await import("node:fs/promises");
      for (const absPath of toRedo.filesEdited) {
        const relPath = relative(cwd, absPath);
        const result = await gitRun(["show", `${toRedo.gitTag}:${relPath}`], cwd, 10_000);
        if (result.ok) {
          await writeFile(absPath, result.stdout);
          restoredFiles.push(absPath);
        }
      }
    }

    // Un-mark the checkpoint as undone
    const newCheckpoints = tab.checkpoints.map((cp) =>
      cp.anchorMessageId === toRedo.anchorMessageId ? { ...cp, undone: false } : cp,
    );

    // Messages = the redo checkpoint's snapshot
    const messages = toRedo.messagesSnapshot;

    set({
      tabs: {
        ...state.tabs,
        [tabId]: {
          ...tab,
          checkpoints: newCheckpoints,
          redoStack: newRedoStack,
          viewing: null,
        },
      },
    });

    return { messages, restoredFiles };
  },

  canRedo(tabId: string): boolean {
    return (get().tabs[tabId]?.redoStack.length ?? 0) > 0;
  },

  getRedoCount(tabId: string): number {
    return get().tabs[tabId]?.redoStack.length ?? 0;
  },

  async cleanupGitTags(tabId: string, cwd: string): Promise<void> {
    const prefix = `soulforge/cp-${tabId.slice(0, 8)}-`;
    const result = await gitRun(["tag", "-l", `${prefix}*`], cwd);
    if (!result.ok) return;
    const tags = result.stdout.trim().split("\n").filter(Boolean);
    for (const tag of tags) {
      await gitRun(["tag", "-d", tag], cwd);
    }
  },

  restoreTagsFromMeta(
    tabId: string,
    tags: Array<{ index: number; anchorMessageId: string; gitTag: string }>,
  ) {
    set((s) => {
      const tab = s.tabs[tabId];
      if (!tab) return s;
      const updated = tab.checkpoints.map((cp) => {
        const saved = tags.find(
          (t) => t.anchorMessageId === cp.anchorMessageId || t.index === cp.index,
        );
        return saved ? { ...cp, gitTag: saved.gitTag } : cp;
      });
      return { tabs: { ...s.tabs, [tabId]: { ...tab, checkpoints: updated } } };
    });
  },

  skipCleanup(tabId: string) {
    const next = new Set(get().skipCleanupTabs);
    next.add(tabId);
    set({ skipCleanupTabs: next });
  },

  shouldSkipCleanup(tabId: string): boolean {
    return get().skipCleanupTabs.has(tabId);
  },

  clear(tabId: string) {
    const state = get();
    const { [tabId]: _, ...rest } = state.tabs;
    const next = new Set(state.skipCleanupTabs);
    next.delete(tabId);
    set({ tabs: rest, skipCleanupTabs: next });
  },
}));
