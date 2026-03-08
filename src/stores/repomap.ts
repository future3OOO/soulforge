import { create } from "zustand";

export type RepoMapStatus = "off" | "scanning" | "ready" | "error";
export type SemanticStatus = "off" | "generating" | "ready" | "error";

interface RepoMapState {
  status: RepoMapStatus;
  files: number;
  symbols: number;
  edges: number;
  dbSizeBytes: number;
  scanProgress: string;
  scanError: string;
  semanticStatus: SemanticStatus;
  semanticCount: number;
  semanticProgress: string;
  semanticModel: string;

  setStatus: (status: RepoMapStatus) => void;
  setStats: (files: number, symbols: number, edges: number, dbSizeBytes: number) => void;
  setScanProgress: (msg: string) => void;
  setScanError: (msg: string) => void;
  setSemanticStatus: (status: SemanticStatus) => void;
  setSemanticCount: (count: number) => void;
  setSemanticProgress: (msg: string) => void;
  setSemanticModel: (model: string) => void;
}

export const useRepoMapStore = create<RepoMapState>()((set) => ({
  status: "off",
  files: 0,
  symbols: 0,
  edges: 0,
  dbSizeBytes: 0,
  scanProgress: "",
  scanError: "",
  semanticStatus: "off",
  semanticCount: 0,
  semanticProgress: "",
  semanticModel: "",

  setStatus: (status) => set({ status }),
  setStats: (files, symbols, edges, dbSizeBytes) => set({ files, symbols, edges, dbSizeBytes }),
  setScanProgress: (scanProgress) => set({ scanProgress }),
  setScanError: (scanError) => set({ scanError }),
  setSemanticStatus: (semanticStatus) => set({ semanticStatus }),
  setSemanticCount: (semanticCount) => set({ semanticCount }),
  setSemanticProgress: (semanticProgress) => set({ semanticProgress }),
  setSemanticModel: (semanticModel) => set({ semanticModel }),
}));
