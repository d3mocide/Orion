import { useUIStore, type SimSpeed } from "@/shared/store/ui.store";
import { jdToIso } from "@/shared/utils/time";

const SPEEDS: SimSpeed[] = [1, 10, 60, 600];

export function TopBar() {
  const fps = useUIStore((s) => s.fps);
  const catalogSize = useUIStore((s) => s.catalogSize);
  const simTimeJd = useUIStore((s) => s.simTimeJd);
  const simSpeed = useUIStore((s) => s.simSpeed);
  const simPaused = useUIStore((s) => s.simPaused);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const catalogDrawerOpen = useUIStore((s) => s.catalogDrawerOpen);
  const toggleSimPaused = useUIStore((s) => s.toggleSimPaused);
  const setSimSpeed = useUIStore((s) => s.setSimSpeed);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const setCatalogDrawerOpen = useUIStore((s) => s.setCatalogDrawerOpen);

  return (
    <header className="absolute top-0 left-0 right-0 h-12 z-30 backdrop-blur-md bg-slate-900/70 border-b border-slate-700/50 flex items-center px-4 gap-4">
      <span className="text-space-accent font-bold tracking-wider text-sm">ORION</span>

      <div className="h-4 w-px bg-slate-700" />

      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
      >
        {sidebarOpen ? "Hide Filters" : "Filters"}
      </button>

      <div className="flex-1" />

      {/* Sim time */}
      <span className="text-xs font-mono text-slate-300">
        {jdToIso(simTimeJd).replace("T", " ").slice(0, 19)} UTC
      </span>

      {/* Playback controls */}
      <button
        onClick={toggleSimPaused}
        className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-500 transition-colors"
      >
        {simPaused ? "▶" : "⏸"}
      </button>

      {SPEEDS.map((s) => (
        <button
          key={s}
          onClick={() => setSimSpeed(s)}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            simSpeed === s
              ? "bg-space-accent/20 border-space-accent text-space-accent"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
          }`}
        >
          ×{s}
        </button>
      ))}

      <div className="h-4 w-px bg-slate-700" />

      {/* Metrics */}
      <span className="text-xs font-mono text-slate-500">
        <span
          className={
            fps >= 55 ? "text-space-green" : fps >= 30 ? "text-yellow-400" : "text-red-400"
          }
        >
          {fps} FPS
        </span>
      </span>
      <span className="text-xs font-mono text-slate-500">
        {catalogSize.toLocaleString()} objects
      </span>

      {/* Catalog table toggle */}
      <button
        onClick={() => setCatalogDrawerOpen(!catalogDrawerOpen)}
        className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
      >
        Catalog
      </button>
    </header>
  );
}
