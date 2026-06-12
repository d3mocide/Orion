import { useMemo, useState } from "react";
import { useUIStore } from "@/shared/store/ui.store";
import { useFiltersStore, type OrbitRegime } from "@/shared/store/filters.store";
import { useObserverStore } from "@/shared/store/observer.store";
import type { OMMGroup } from "@/shared/types/omm";
import { REGIME_COLORS_CSS } from "@/features/spatial-rendering/three/constants";
import {
  getUniqueOperators,
  getUniqueCountries,
  getUniquePurposes,
} from "@/features/osint-intelligence/ucs-database";

const REGIMES: OrbitRegime[] = ["LEO", "MEO", "GEO", "HEO"];
const MAX_CHIPS = 16;

const GROUPS: { id: OMMGroup; label: string }[] = [
  { id: "active", label: "Active catalog" },
  { id: "starlink", label: "Starlink" },
  { id: "oneweb", label: "OneWeb" },
  { id: "gps-ops", label: "GPS" },
  { id: "geo", label: "Geostationary" },
  { id: "iridium-NEXT", label: "Iridium NEXT" },
  { id: "last-30-days", label: "Recent launches" },
];

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
          title={item}
          className={`max-w-[120px] truncate rounded-full px-2 py-0.5 text-[10px] ${
            active.has(item) ? "chip chip-active" : "chip"
          }`}
        >
          {item}
        </button>
      ))}
      {items.length > MAX_CHIPS && (
        <span className="self-center text-[10px] text-zinc-600">
          +{items.length - MAX_CHIPS} more
        </span>
      )}
    </div>
  );
}

function ObserverCard() {
  const location = useObserverStore((s) => s.location);
  const label = useObserverStore((s) => s.label);
  const setLocation = useObserverStore((s) => s.setLocation);

  const [lat, setLat] = useState(location ? String(location.latDeg) : "");
  const [lon, setLon] = useState(location ? String(location.lonDeg) : "");
  const [busy, setBusy] = useState(false);

  const save = () => {
    const latDeg = parseFloat(lat);
    const lonDeg = parseFloat(lon);
    if (!isFinite(latDeg) || !isFinite(lonDeg) || Math.abs(latDeg) > 90 || Math.abs(lonDeg) > 180)
      return;
    setLocation({ latDeg, lonDeg, altKm: 0 }, "Manual");
  };

  const locate = () => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latDeg = Math.round(pos.coords.latitude * 1000) / 1000;
        const lonDeg = Math.round(pos.coords.longitude * 1000) / 1000;
        setLat(String(latDeg));
        setLon(String(lonDeg));
        setLocation({ latDeg, lonDeg, altKm: (pos.coords.altitude ?? 0) / 1000 }, "GPS fix");
        setBusy(false);
      },
      () => setBusy(false),
      { timeout: 10_000 },
    );
  };

  return (
    <div>
      <p className="panel-heading">Ground Station</p>
      {location && (
        <p className="mb-2 font-mono text-[11px] text-zinc-200">
          {location.latDeg.toFixed(3)}°, {location.lonDeg.toFixed(3)}°
          {label && <span className="ml-1 text-zinc-600">({label})</span>}
        </p>
      )}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <input
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          placeholder="Lat °N"
          className="field"
        />
        <input
          value={lon}
          onChange={(e) => setLon(e.target.value)}
          placeholder="Lon °E"
          className="field"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={save} className="chip chip-active flex-1 px-2 py-1 text-[11px]">
          Set
        </button>
        <button
          onClick={locate}
          disabled={busy}
          className="chip flex-1 px-2 py-1 text-[11px] disabled:opacity-50"
        >
          {busy ? "Locating…" : "Use GPS"}
        </button>
        {location && (
          <button
            onClick={() => setLocation(null)}
            className="chip px-2 py-1 text-[11px]"
            aria-label="Clear ground station"
          >
            ✕
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-zinc-600">
        Enables pass prediction, polar tracking, and Doppler analysis.
      </p>
    </div>
  );
}

export function Sidebar() {
  const open = useUIStore((s) => s.sidebarOpen);
  const ucsLoaded = useUIStore((s) => s.ucsLoaded);
  const group = useUIStore((s) => s.group);
  const setGroup = useUIStore((s) => s.setGroup);

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

  const opList = useMemo(() => (ucsLoaded ? getUniqueOperators() : []), [ucsLoaded]);
  const ctrList = useMemo(() => (ucsLoaded ? getUniqueCountries() : []), [ucsLoaded]);
  const purpList = useMemo(() => (ucsLoaded ? getUniquePurposes() : []), [ucsLoaded]);

  if (!open) return null;

  return (
    <aside className="glass-panel absolute bottom-14 left-3 top-16 z-20 w-72 overflow-y-auto rounded-lg p-4">
      <div className="space-y-6">
        <div>
          <p className="panel-heading">Constellation</p>
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value as OMMGroup)}
            className="field py-1.5 text-xs"
          >
            {GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="panel-heading">Orbit Regime</p>
          <div className="flex flex-wrap gap-1.5">
            {REGIMES.map((r) => (
              <button
                key={r}
                onClick={() => toggleRegime(r)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${
                  regimes.has(r) ? "chip chip-active" : "chip"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: REGIME_COLORS_CSS[r] }}
                />
                {r}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-zinc-600">
            No selection = show everything. Colors match the globe.
          </p>
        </div>

        <ObserverCard />

        {ucsLoaded ? (
          <>
            {opList.length > 0 && (
              <div>
                <p className="panel-heading">Operator</p>
                <ChipList items={opList} active={operators} onToggle={toggleOperator} />
              </div>
            )}
            {ctrList.length > 0 && (
              <div>
                <p className="panel-heading">Country</p>
                <ChipList items={ctrList} active={countries} onToggle={toggleCountry} />
              </div>
            )}
            {purpList.length > 0 && (
              <div>
                <p className="panel-heading">Purpose</p>
                <ChipList items={purpList} active={purposes} onToggle={togglePurpose} />
              </div>
            )}
          </>
        ) : (
          <p className="text-[10px] italic leading-snug text-zinc-600">
            Load the UCS Satellite Database CSV to unlock operator / country / purpose facets.
          </p>
        )}

        <button
          onClick={clearAll}
          className="w-full py-1 text-xs text-zinc-600 transition-colors hover:text-zinc-300"
        >
          Clear all filters
        </button>
      </div>
    </aside>
  );
}
