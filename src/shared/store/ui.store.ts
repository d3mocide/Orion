import { create } from "zustand";

export type SimSpeed = 1 | 10 | 60 | 600;

interface UIState {
  sidebarOpen: boolean;
  detailPanelOpen: boolean;
  catalogDrawerOpen: boolean;
  fps: number;
  catalogSize: number;
  simTimeJd: number;
  simSpeed: SimSpeed;
  simPaused: boolean;
  setSidebarOpen: (open: boolean) => void;
  setDetailPanelOpen: (open: boolean) => void;
  setCatalogDrawerOpen: (open: boolean) => void;
  setFps: (fps: number) => void;
  setCatalogSize: (n: number) => void;
  setSimTimeJd: (jd: number) => void;
  setSimSpeed: (speed: SimSpeed) => void;
  toggleSimPaused: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  detailPanelOpen: false,
  catalogDrawerOpen: false,
  fps: 0,
  catalogSize: 0,
  simTimeJd: Date.now() / 86_400_000 + 2_440_587.5,
  simSpeed: 1,
  simPaused: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setDetailPanelOpen: (open) => set({ detailPanelOpen: open }),
  setCatalogDrawerOpen: (open) => set({ catalogDrawerOpen: open }),
  setFps: (fps) => set({ fps }),
  setCatalogSize: (catalogSize) => set({ catalogSize }),
  setSimTimeJd: (simTimeJd) => set({ simTimeJd }),
  setSimSpeed: (simSpeed) => set({ simSpeed }),
  toggleSimPaused: () => set((s) => ({ simPaused: !s.simPaused })),
}));
