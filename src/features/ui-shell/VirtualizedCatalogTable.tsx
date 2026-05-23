import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useUIStore } from "@/shared/store/ui.store";
import { useSelectionStore } from "@/shared/store/selection.store";

interface CatalogRow {
  noradId: string;
  name: string;
  epoch: string;
}

interface VirtualizedCatalogTableProps {
  rows: CatalogRow[];
}

const ROW_HEIGHT = 24;

export function VirtualizedCatalogTable({ rows }: VirtualizedCatalogTableProps) {
  const open = useUIStore((s) => s.catalogDrawerOpen);
  const select = useSelectionStore((s) => s.select);
  const selectedId = useSelectionStore((s) => s.selectedNoradId);
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (!open) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-48 z-20 backdrop-blur-md bg-slate-900/80 border-t border-slate-700/50">
      {/* Title bar */}
      <div className="flex items-center px-4 h-8 border-b border-slate-700/50">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          Catalog ({rows.length.toLocaleString()} objects)
        </span>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[80px_1fr_90px] text-[10px] text-slate-500 px-4 py-1 border-b border-slate-800">
        <span>NORAD ID</span>
        <span>Name</span>
        <span>Epoch</span>
      </div>

      {/* Virtualized rows — 192px total − 32px title − 24px col header = 136px */}
      <div ref={parentRef} className="overflow-y-auto" style={{ height: 136 }}>
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((vItem) => {
            const row = rows[vItem.index];
            const isSelected = row.noradId === selectedId;
            return (
              <div
                key={vItem.key}
                data-index={vItem.index}
                ref={rowVirtualizer.measureElement}
                onClick={() => select(row.noradId)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${vItem.size}px`,
                  transform: `translateY(${vItem.start}px)`,
                }}
                className={`grid grid-cols-[80px_1fr_90px] px-4 items-center cursor-pointer text-[10px] ${
                  isSelected
                    ? "bg-space-accent/10 text-space-accent"
                    : "hover:bg-slate-700/30 text-slate-300"
                }`}
              >
                <span className="font-mono">{row.noradId}</span>
                <span className="truncate pr-2">{row.name}</span>
                <span className="text-slate-500">{row.epoch.slice(0, 10)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
