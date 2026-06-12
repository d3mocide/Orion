import { useUIStore } from "@/shared/store/ui.store";

const SOURCE_LABELS: Record<string, { text: string; cls: string }> = {
  live: { text: "CELESTRAK LIVE", cls: "text-aurora-teal" },
  cache: { text: "CACHED", cls: "text-aurora-violet" },
  demo: { text: "DEMO DATA", cls: "text-aurora-amber" },
  loading: { text: "LOADING…", cls: "text-slate-500" },
};

export function StatusBar() {
  const fps = useUIStore((s) => s.fps);
  const catalogSize = useUIStore((s) => s.catalogSize);
  const dataSource = useUIStore((s) => s.dataSource);
  const src = SOURCE_LABELS[dataSource] ?? SOURCE_LABELS.loading;

  return (
    <footer className="pointer-events-none absolute bottom-3 left-3 z-30">
      <div className="glass-panel pointer-events-auto flex items-center gap-3 rounded-xl px-3 py-1.5 font-mono text-[11px]">
        <span
          className={
            fps >= 50 ? "text-aurora-teal" : fps >= 30 ? "text-aurora-amber" : "text-red-400"
          }
        >
          {fps} FPS
        </span>
        <div className="h-3 w-px bg-white/10" />
        <span className="text-slate-400" data-testid="catalog-count">
          {catalogSize.toLocaleString()} objects
        </span>
        <div className="h-3 w-px bg-white/10" />
        <span className={`tracking-wider ${src.cls}`}>{src.text}</span>
      </div>
    </footer>
  );
}
