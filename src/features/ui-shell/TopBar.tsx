import { useMemo, useState } from "react";
import { useUIStore, type SimSpeed } from "@/shared/store/ui.store";
import { useSelectionStore } from "@/shared/store/selection.store";
import { jdToIso, nowJd } from "@/shared/utils/time";

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
    <div className="relative w-60">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Search satellites…"
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-aurora-teal/60"
      />
      {focused && matches.length > 0 && (
        <div className="glass-panel absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg">
          {matches.map((m) => (
            <button
              key={m.noradId}
              onMouseDown={() => {
                select(m.noradId);
                setQuery("");
              }}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-aurora-teal/10"
            >
              <span className="truncate">{m.name}</span>
              <span className="ml-2 shrink-0 font-mono text-[10px] text-aurora-violet">
                {m.noradId}
              </span>
            </button>
          ))}
        </div>
      )}
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

  return (
    <header className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-start gap-3 p-3">
      <div className="glass-panel pointer-events-auto flex items-center gap-4 rounded-xl px-4 py-2">
        <span className="aurora-text select-none text-base font-bold tracking-[0.3em]">ORION</span>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`text-xs transition-colors ${sidebarOpen ? "text-aurora-teal" : "text-slate-400 hover:text-slate-200"}`}
        >
          Mission
        </button>
        <button
          onClick={() => setCatalogDrawerOpen(!catalogDrawerOpen)}
          className={`text-xs transition-colors ${catalogDrawerOpen ? "text-aurora-teal" : "text-slate-400 hover:text-slate-200"}`}
        >
          Catalog
        </button>
        <SearchBox rows={searchRows} />
      </div>

      <div className="flex-1" />

      <div className="glass-panel pointer-events-auto flex items-center gap-2 rounded-xl px-3 py-2">
        <span className="font-mono text-xs text-slate-300" data-testid="sim-clock">
          {jdToIso(simTimeJd).replace("T", " ").slice(0, 19)} UTC
        </span>
        <div className="h-4 w-px bg-white/10" />
        <button
          onClick={toggleSimPaused}
          title={simPaused ? "Resume" : "Pause"}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-200 transition-colors hover:border-aurora-teal/60"
        >
          {simPaused ? "▶" : "⏸"}
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSimSpeed(s)}
            className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
              simSpeed === s
                ? "border-aurora-violet/70 bg-aurora-violet/15 text-aurora-violet"
                : "border-white/10 bg-white/5 text-slate-400 hover:border-white/30"
            }`}
          >
            ×{s}
          </button>
        ))}
        <button
          onClick={() => setSimTimeJd(nowJd())}
          title="Jump to real time"
          className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-400 transition-colors hover:border-aurora-teal/60 hover:text-aurora-teal"
        >
          NOW
        </button>
      </div>
    </header>
  );
}
