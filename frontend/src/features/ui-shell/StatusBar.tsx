import { useEffect, useState } from "react";
import { useUIStore } from "@/shared/store/ui.store";
import { getLastFetch } from "@/features/telemetry-ingestion/cache/indexeddb";

const SOURCE_LABELS: Record<string, { text: string; cls: string }> = {
  live: { text: "CELESTRAK LIVE", cls: "text-signal-pos" },
  cache: { text: "CACHED", cls: "text-zinc-400" },
  demo: { text: "DEMO DATA", cls: "text-signal-warn" },
  loading: { text: "LOADING…", cls: "text-zinc-600" },
};

function fmtAge(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

export function StatusBar() {
  const fps = useUIStore((s) => s.fps);
  const catalogSize = useUIStore((s) => s.catalogSize);
  const dataSource = useUIStore((s) => s.dataSource);
  const group = useUIStore((s) => s.group);
  const src = SOURCE_LABELS[dataSource] ?? SOURCE_LABELS.loading;

  // Element-set age (last successful CelesTrak fetch for the active group)
  const [ageMs, setAgeMs] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getLastFetch(`omm-${group}`).then((t) => {
        if (!cancelled) setAgeMs(t ? Date.now() - t : null);
      });
    };
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [group, dataSource]);

  const ageStale = ageMs !== null && ageMs > 6 * 60 * 60 * 1000;

  return (
    <footer className="pointer-events-none z-30 hidden self-start md:block">
      <div
        className="glass-panel pointer-events-auto flex items-center gap-3 rounded-lg px-3 py-1.5 font-mono text-[11px]"
        title={
          dataSource === "demo"
            ? "CelesTrak was unreachable — showing a synthetic demo constellation. Check the /api/celestrak proxy on the server."
            : undefined
        }
      >
        <span
          className={
            fps >= 50 ? "text-zinc-300" : fps >= 30 ? "text-signal-warn" : "text-signal-neg"
          }
        >
          {fps} FPS
        </span>
        <div className="h-3 w-px bg-white/10" />
        <span className="text-zinc-400" data-testid="catalog-count">
          {catalogSize.toLocaleString()} objects
        </span>
        <div className="h-3 w-px bg-white/10" />
        <span className={`tracking-wider ${src.cls}`}>{src.text}</span>
        {ageMs !== null && (
          <>
            <div className="h-3 w-px bg-white/10" />
            <span className={ageStale ? "text-signal-warn" : "text-zinc-500"}>
              elements {fmtAge(ageMs)} old
            </span>
          </>
        )}
      </div>
    </footer>
  );
}
