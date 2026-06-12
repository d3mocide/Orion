import { create } from "zustand";
import type { OMMGroup } from "@/shared/types/omm";

export type SimSpeed = 1 | 10 | 60 | 600;
export type DataSource = "live" | "cache" | "demo" | "loading";
export type PanelId = "sidebar" | "catalog" | "detail";

/** On phones the globe is the hero — panels start closed and open one at a time. */
const isDesktopViewport = () =>
  typeof window === "undefined" ||
  typeof window.matchMedia !== "function" ||
  window.matchMedia("(min-width: 768px)").matches;

interface UIState {
  sidebarOpen: boolean;
  detailPanelOpen: boolean;
  catalogDrawerOpen: boolean;
  fps: number;
  catalogSize: number;
  simTimeJd: number;
  simSpeed: SimSpeed;
  simPaused: boolean;
  ucsLoaded: boolean;
  group: OMMGroup;
  dataSource: DataSource;
  setGroup: (group: OMMGroup) => void;
  setDataSource: (src: DataSource) => void;
  setSidebarOpen: (open: boolean) => void;
  setDetailPanelOpen: (open: boolean) => void;
  setCatalogDrawerOpen: (open: boolean) => void;
  /** Open one panel and close the others (mobile bottom-sheet behavior). */
  openExclusivePanel: (panel: PanelId | null) => void;
  setFps: (fps: number) => void;
  setCatalogSize: (n: number) => void;
  setSimTimeJd: (jd: number) => void;
  setSimSpeed: (speed: SimSpeed) => void;
  toggleSimPaused: () => void;
  setUcsLoaded: (loaded: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: isDesktopViewport(),
  detailPanelOpen: false,
  catalogDrawerOpen: false,
  fps: 0,
  catalogSize: 0,
  simTimeJd: Date.now() / 86_400_000 + 2_440_587.5,
  simSpeed: 1,
  simPaused: false,
  ucsLoaded: false,
  group: "active",
  dataSource: "loading",
  setGroup: (group) => set({ group }),
  setDataSource: (dataSource) => set({ dataSource }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setDetailPanelOpen: (open) => set({ detailPanelOpen: open }),
  setCatalogDrawerOpen: (open) => set({ catalogDrawerOpen: open }),
  openExclusivePanel: (panel) =>
    set({
      sidebarOpen: panel === "sidebar",
      catalogDrawerOpen: panel === "catalog",
      detailPanelOpen: panel === "detail",
    }),
  setFps: (fps) => set({ fps }),
  setCatalogSize: (catalogSize) => set({ catalogSize }),
  setSimTimeJd: (simTimeJd) => set({ simTimeJd }),
  setSimSpeed: (simSpeed) => set({ simSpeed }),
  toggleSimPaused: () => set((s) => ({ simPaused: !s.simPaused })),
  setUcsLoaded: (ucsLoaded) => set({ ucsLoaded }),
}));
