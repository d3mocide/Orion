import { useMemo } from "react";
import { useFiltersStore, type OrbitRegime } from "@/shared/store/filters.store";
import { useUIStore } from "@/shared/store/ui.store";
import {
  getUniqueOperators,
  getUniqueCountries,
  getUniquePurposes,
} from "@/features/osint-intelligence/ucs-database";

const REGIMES: OrbitRegime[] = ["LEO", "MEO", "GEO", "HEO"];
const MAX_CHIPS = 20;

function ChipList({
  items,
  active,
  onToggle,
}: {
  items: string[];
  active: ReadonlySet<string>;
  onToggle: (item: string) => void;
}) {
  const shown = items.slice(0, MAX_CHIPS);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((item) => (
        <button
          key={item}
          onClick={() => onToggle(item)}
          className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors truncate max-w-[120px] ${
            active.has(item)
              ? "bg-space-accent/20 border-space-accent text-space-accent"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
          }`}
          title={item}
        >
          {item}
        </button>
      ))}
      {items.length > MAX_CHIPS && (
        <span className="text-[10px] text-slate-600 self-center">
          +{items.length - MAX_CHIPS} more
        </span>
      )}
    </div>
  );
}

export function FilterPanel() {
  const {
    regimes,
    operators,
    countries,
    purposes,
    toggleRegime,
    toggleOperator,
    toggleCountry,
    togglePurpose,
    clearAll,
  } = useFiltersStore();
  const ucsLoaded = useUIStore((s) => s.ucsLoaded);

  const opList = useMemo(() => (ucsLoaded ? getUniqueOperators() : []), [ucsLoaded]);
  const ctrList = useMemo(() => (ucsLoaded ? getUniqueCountries() : []), [ucsLoaded]);
  const purpList = useMemo(() => (ucsLoaded ? getUniquePurposes() : []), [ucsLoaded]);

  return (
    <div className="space-y-4">
      {/* Orbit Regime */}
      <div>
        <p className="text-xs text-slate-500 mb-2">Orbit Regime</p>
        <div className="flex flex-wrap gap-1.5">
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

      {/* UCS-backed facets */}
      {ucsLoaded ? (
        <>
          {opList.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2">Operator</p>
              <ChipList items={opList} active={operators} onToggle={toggleOperator} />
            </div>
          )}
          {ctrList.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2">Country</p>
              <ChipList items={ctrList} active={countries} onToggle={toggleCountry} />
            </div>
          )}
          {purpList.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2">Purpose</p>
              <ChipList items={purpList} active={purposes} onToggle={togglePurpose} />
            </div>
          )}
        </>
      ) : (
        <p className="text-[10px] text-slate-600 italic">
          Load UCS Satellite Database CSV to enable operator / country / purpose filters.
        </p>
      )}

      <button
        onClick={clearAll}
        className="w-full text-xs text-slate-500 hover:text-slate-300 py-1 transition-colors"
      >
        Clear all filters
      </button>
    </div>
  );
}
