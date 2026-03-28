import { create } from "zustand";

export interface TerminalEntry {
  id: number;
  label: string;
  cwd: string;
  active: boolean;
  pid: number | null;
}

interface TerminalState {
  terminals: TerminalEntry[];
  selectedId: number | null;
  nextId: number;

  addTerminal: (entry: Omit<TerminalEntry, "id">) => number;
  removeTerminal: (id: number) => void;
  selectTerminal: (id: number) => void;
  renameTerminal: (id: number, label: string) => void;
  updateTerminal: (id: number, patch: Partial<TerminalEntry>) => void;
}

export const MAX_TERMINALS = 5;

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  terminals: [],
  selectedId: null,
  nextId: 1,

  addTerminal: (entry) => {
    const { terminals, nextId } = get();
    if (terminals.length >= MAX_TERMINALS) return -1;
    const id = nextId;
    set({
      terminals: [...terminals, { ...entry, id }],
      selectedId: id,
      nextId: nextId + 1,
    });
    return id;
  },

  removeTerminal: (id) =>
    set((s) => {
      const filtered = s.terminals.filter((t) => t.id !== id);
      const selectedId =
        s.selectedId === id ? (filtered[filtered.length - 1]?.id ?? null) : s.selectedId;
      return { terminals: filtered, selectedId };
    }),

  selectTerminal: (id) => set({ selectedId: id }),

  renameTerminal: (id, label) =>
    set((s) => ({
      terminals: s.terminals.map((t) => (t.id === id ? { ...t, label } : t)),
    })),

  updateTerminal: (id, patch) =>
    set((s) => ({
      terminals: s.terminals.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
}));
