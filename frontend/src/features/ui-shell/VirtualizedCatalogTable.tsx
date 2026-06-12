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
    <div className="glass-panel pointer-events-auto z-20 flex h-52 shrink-0 flex-col overflow-hidden rounded-lg max-md:h-[42dvh]">
      <div className="flex h-8 shrink-0 items-center border-b border-white/[0.07] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
          Catalog · {rows.length.toLocaleString()} objects
        </span>
      </div>

      <div className="grid shrink-0 grid-cols-[90px_1fr_90px] border-b border-white/[0.04] px-4 py-1 text-[10px] uppercase tracking-wider text-zinc-600">
        <span>NORAD</span>
        <span>Name</span>
        <span>Epoch</span>
      </div>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
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
                className={`grid cursor-pointer grid-cols-[90px_1fr_90px] items-center px-4 text-[10px] transition-colors ${
                  isSelected
                    ? "bg-white/[0.09] text-zinc-100"
                    : "text-zinc-400 hover:bg-white/[0.04]"
                }`}
              >
                <span className="font-mono">{row.noradId}</span>
                <span className="truncate pr-2">{row.name}</span>
                <span className="font-mono text-zinc-600">{row.epoch.slice(0, 10)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
