import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GeodeticLocation } from "@/shared/utils/astro";

interface ObserverState {
  /** Ground station location; null until the user sets one */
  location: GeodeticLocation | null;
  /** Human-readable label, e.g. "Home QTH" or a city name */
  label: string;
  setLocation: (loc: GeodeticLocation | null, label?: string) => void;
}

export const useObserverStore = create<ObserverState>()(
  persist(
    (set) => ({
      location: null,
      label: "",
      setLocation: (location, label = "") => set({ location, label }),
    }),
    { name: "orion-observer" },
  ),
);
