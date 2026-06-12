import { useUIStore, type PanelId } from "@/shared/store/ui.store";
import { useSelectionStore } from "@/shared/store/selection.store";

const SOURCE_DOTS: Record<string, { cls: string; label: string }> = {
  live: { cls: "bg-signal-pos", label: "LIVE" },
  cache: { cls: "bg-zinc-400", label: "CACHED" },
  demo: { cls: "bg-signal-warn", label: "DEMO" },
  loading: { cls: "bg-zinc-600", label: "…" },
};

/**
 * Phone-only bottom bar: panel tabs plus a compact data-source readout.
 * Panels open as bottom sheets, one at a time (openExclusivePanel).
 */
export function MobileNav() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const catalogDrawerOpen = useUIStore((s) => s.catalogDrawerOpen);
  const detailPanelOpen = useUIStore((s) => s.detailPanelOpen);
  const openExclusivePanel = useUIStore((s) => s.openExclusivePanel);
  const catalogSize = useUIStore((s) => s.catalogSize);
  const dataSource = useUIStore((s) => s.dataSource);
  const selectedId = useSelectionStore((s) => s.selectedNoradId);

  const src = SOURCE_DOTS[dataSource] ?? SOURCE_DOTS.loading;

  const tabs: { id: PanelId; label: string; open: boolean; disabled?: boolean }[] = [
    { id: "sidebar", label: "Mission", open: sidebarOpen },
    { id: "catalog", label: "Catalog", open: catalogDrawerOpen },
    { id: "detail", label: "Details", open: detailPanelOpen, disabled: !selectedId },
  ];

  return (
    <nav className="pointer-events-none z-30 md:hidden">
      <div className="glass-panel pointer-events-auto flex items-center gap-1 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            disabled={t.disabled}
            onClick={() => openExclusivePanel(t.open ? null : t.id)}
            className={`flex-1 rounded-md px-2 py-2 text-xs transition-colors ${
              t.open
                ? "bg-white/10 text-zinc-100"
                : t.disabled
                  ? "text-zinc-700"
                  : "text-zinc-400 active:bg-white/[0.06]"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div
          className="flex shrink-0 items-center gap-1.5 px-2 font-mono text-[10px] text-zinc-500"
          title={
            dataSource === "demo"
              ? "CelesTrak was unreachable — showing a synthetic demo constellation."
              : undefined
          }
        >
          <span className={`h-1.5 w-1.5 rounded-full ${src.cls}`} />
          {src.label} · {catalogSize.toLocaleString()}
        </div>
      </div>
    </nav>
  );
}
