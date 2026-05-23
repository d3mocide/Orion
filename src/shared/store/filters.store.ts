import { create } from "zustand";

export type OrbitRegime = "LEO" | "MEO" | "GEO" | "HEO";

interface FiltersState {
  operators: Set<string>;
  countries: Set<string>;
  purposes: Set<string>;
  regimes: Set<OrbitRegime>;
  toggleOperator: (op: string) => void;
  toggleCountry: (country: string) => void;
  togglePurpose: (purpose: string) => void;
  toggleRegime: (regime: OrbitRegime) => void;
  clearAll: () => void;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  operators: new Set(),
  countries: new Set(),
  purposes: new Set(),
  regimes: new Set(),
  toggleOperator: (op) =>
    set((s) => {
      const next = new Set(s.operators);
      if (next.has(op)) {
        next.delete(op);
      } else {
        next.add(op);
      }
      return { operators: next };
    }),
  toggleCountry: (country) =>
    set((s) => {
      const next = new Set(s.countries);
      if (next.has(country)) {
        next.delete(country);
      } else {
        next.add(country);
      }
      return { countries: next };
    }),
  togglePurpose: (purpose) =>
    set((s) => {
      const next = new Set(s.purposes);
      if (next.has(purpose)) {
        next.delete(purpose);
      } else {
        next.add(purpose);
      }
      return { purposes: next };
    }),
  toggleRegime: (regime) =>
    set((s) => {
      const next = new Set(s.regimes);
      if (next.has(regime)) {
        next.delete(regime);
      } else {
        next.add(regime);
      }
      return { regimes: next };
    }),
  clearAll: () =>
    set({ operators: new Set(), countries: new Set(), purposes: new Set(), regimes: new Set() }),
}));
