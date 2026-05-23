import { create } from "zustand";

interface SelectionState {
  selectedNoradId: string | null;
  hoveredNoradId: string | null;
  select: (noradId: string | null) => void;
  hover: (noradId: string | null) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedNoradId: null,
  hoveredNoradId: null,
  select: (noradId) => set({ selectedNoradId: noradId }),
  hover: (noradId) => set({ hoveredNoradId: noradId }),
}));
