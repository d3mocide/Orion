import { create } from "zustand";

/** Live numbers for the selected satellite, refreshed ~2 Hz by the render loop */
export interface LiveStats {
  altKm: number;
  velKms: number;
  /** Sub-satellite point */
  latDeg: number;
  lonDeg: number;
  /** Inside Earth's umbra (cylindrical model) */
  eclipsed: boolean;
  /** Observer-relative; null when no ground station is set */
  azDeg: number | null;
  elDeg: number | null;
  rangeKm: number | null;
}

interface SelectionState {
  selectedNoradId: string | null;
  hoveredNoradId: string | null;
  liveStats: LiveStats | null;
  select: (noradId: string | null) => void;
  hover: (noradId: string | null) => void;
  setLiveStats: (stats: LiveStats | null) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedNoradId: null,
  hoveredNoradId: null,
  liveStats: null,
  select: (noradId) => set({ selectedNoradId: noradId, liveStats: null }),
  hover: (noradId) => set({ hoveredNoradId: noradId }),
  setLiveStats: (liveStats) => set({ liveStats }),
}));
