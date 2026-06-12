import { useMemo, useState } from "react";
import { useUIStore, type SimSpeed } from "@/shared/store/ui.store";
import { useSelectionStore } from "@/shared/store/selection.store";
import { jdToIso, jdToDate, dateToJd, nowJd } from "@/shared/utils/time";

const SPEEDS: SimSpeed[] = [1, 10, 60, 600];

export interface SearchRow {
  noradId: string;
  name: string;
}

interface TopBarProps {
  searchRows: SearchRow[];
}

function SearchBox({ rows }: { rows: SearchRow[] }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const select = useSelectionStore((s) => s.select);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: SearchRow[] = [];
    for (const row of rows) {
      if (row.name.toLowerCase().includes(q) || row.noradId.includes(q)) {
        out.push(row);
        if (out.length >= 8) break;
      }
    }
    return out;
  }, [query, rows]);

  return (
    <div className="relative w-full min-w-0 flex-1 md:w-60 md:flex-none">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Search satellites…"
        className="field py-1.5 text-xs"
      />
      {focused && matches.length > 0 && (
        <div className="glass-panel absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md">
          {matches.map((m) => (
            <button
              key={m.noradId}
              onMouseDown={() => {
                select(m.noradId);
                setQuery("");
              }}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-white/[0.07]"
            >
              <span className="truncate">{m.name}</span>
              <span
                data-testid="search-result-id"
                className="ml-2 shrink-0 font-mono text-[10px] text-zinc-500"
              >
                {m.noradId}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Set the simulation clock to an explicit UTC date/time */
function TimeSetter({ onClose }: { onClose: () => void }) {
  const simTimeJd = useUIStore((s) => s.simTimeJd);
  const setSimTimeJd = useUIStore((s) => s.setSimTimeJd);
  const simSpeed = useUIStore((s) => s.simSpeed);
  const setSimSpeed = useUIStore((s) => s.setSimSpeed);
  const [value, setValue] = useState(jdToIso(simTimeJd).slice(0, 19));

  const apply = () => {
    const ms = Date.parse(value.endsWith("Z") ? value : value + "Z");
    if (!isNaN(ms)) {
      setSimTimeJd(dateToJd(ms));
      onClose();
    }
  };

  return (
    <div className="glass-panel absolute right-0 top-full z-50 mt-1 w-64 rounded-md p-3">
      <p className="panel-heading">Set Date &amp; Time (UTC)</p>
      <input
        className="field mb-2"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply()}
        placeholder="YYYY-MM-DDTHH:MM:SS"
      />
      <div className="mb-2 font-mono text-[10px] text-zinc-600">
        Unix epoch: {Math.floor(jdToDate(simTimeJd).getTime() / 1000)}
      </div>
      {/* Speed controls live inline on desktop; on phones they fit here */}
      <div className="mb-2 flex gap-1.5 md:hidden">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSimSpeed(s)}
            className={`flex-1 px-2 py-1 text-xs ${simSpeed === s ? "chip chip-active" : "chip"}`}
          >
            ×{s}
          </button>
        ))}
        <button
          onClick={() => {
            setSimTimeJd(nowJd());
            onClose();
          }}
          className="chip flex-1 px-2 py-1 text-xs"
        >
          NOW
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={apply} className="chip chip-active flex-1 px-2 py-1 text-[11px]">
          Apply
        </button>
        <button onClick={onClose} className="chip flex-1 px-2 py-1 text-[11px]">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function TopBar({ searchRows }: TopBarProps) {
  const simTimeJd = useUIStore((s) => s.simTimeJd);
  const simSpeed = useUIStore((s) => s.simSpeed);
  const simPaused = useUIStore((s) => s.simPaused);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const catalogDrawerOpen = useUIStore((s) => s.catalogDrawerOpen);
  const toggleSimPaused = useUIStore((s) => s.toggleSimPaused);
  const setSimSpeed = useUIStore((s) => s.setSimSpeed);
  const setSimTimeJd = useUIStore((s) => s.setSimTimeJd);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const setCatalogDrawerOpen = useUIStore((s) => s.setCatalogDrawerOpen);
  const [timeSetterOpen, setTimeSetterOpen] = useState(false);

  const iso = jdToIso(simTimeJd);

  return (
    <header className="pointer-events-none z-30 flex flex-wrap items-start gap-2">
      <div className="glass-panel pointer-events-auto flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 sm:flex-none sm:gap-4 sm:px-4">
        <span className="select-none text-sm font-semibold tracking-[0.32em] text-zinc-100">
          ORION
        </span>
        <div className="hidden h-4 w-px bg-white/10 md:block" />
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`hidden text-xs transition-colors md:block ${sidebarOpen ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
        >
          Mission
        </button>
        <button
          onClick={() => setCatalogDrawerOpen(!catalogDrawerOpen)}
          className={`hidden text-xs transition-colors md:block ${catalogDrawerOpen ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
        >
          Catalog
        </button>
        <SearchBox rows={searchRows} />
      </div>

      <div className="hidden flex-1 md:block" />

      <div className="glass-panel pointer-events-auto relative flex items-center gap-2 rounded-lg px-3 py-2">
        <button
          onClick={() => setTimeSetterOpen(!timeSetterOpen)}
          title="Set date & time"
          className="whitespace-nowrap font-mono text-xs text-zinc-300 transition-colors hover:text-zinc-100"
          data-testid="sim-clock"
        >
          <span className="hidden md:inline">{iso.slice(0, 10)} </span>
          {iso.slice(11, 19)} UTC
        </button>
        <div className="h-4 w-px bg-white/10" />
        <button
          onClick={toggleSimPaused}
          title={simPaused ? "Resume" : "Pause"}
          className="chip px-2 py-0.5 text-xs text-zinc-200"
        >
          {simPaused ? "▶" : "⏸"}
        </button>
        <div className="hidden items-center gap-2 md:flex">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSimSpeed(s)}
              className={`px-2 py-0.5 text-xs ${simSpeed === s ? "chip chip-active" : "chip"}`}
            >
              ×{s}
            </button>
          ))}
          <button
            onClick={() => setSimTimeJd(nowJd())}
            title="Jump to real time"
            className="chip px-2 py-0.5 text-xs"
          >
            NOW
          </button>
        </div>
        {timeSetterOpen && <TimeSetter onClose={() => setTimeSetterOpen(false)} />}
      </div>
    </header>
  );
}
