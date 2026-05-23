import { useFiltersStore, type OrbitRegime } from "@/shared/store/filters.store";

const REGIMES: OrbitRegime[] = ["LEO", "MEO", "GEO", "HEO"];

export function FilterPanel() {
  const { regimes, toggleRegime, clearAll } = useFiltersStore();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500 mb-2">Orbit Regime</p>
        <div className="flex flex-wrap gap-2">
          {REGIMES.map((r) => (
            <button
              key={r}
              onClick={() => toggleRegime(r)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                regimes.has(r)
                  ? "bg-space-accent/20 border-space-accent text-space-accent"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-1">Operator</p>
        <p className="text-xs text-slate-600 italic">Populated from UCS data (Phase 4)</p>
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-1">Country</p>
        <p className="text-xs text-slate-600 italic">Populated from UCS data (Phase 4)</p>
      </div>

      <button
        onClick={clearAll}
        className="w-full text-xs text-slate-500 hover:text-slate-300 py-1 transition-colors"
      >
        Clear all filters
      </button>
    </div>
  );
}
