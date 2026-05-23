import { useSelectionStore } from "@/shared/store/selection.store";
import { useUIStore } from "@/shared/store/ui.store";

export function SatelliteDetailPanel() {
  const selectedId = useSelectionStore((s) => s.selectedNoradId);
  const open = useUIStore((s) => s.detailPanelOpen);

  if (!open || !selectedId) return null;

  return (
    <aside className="absolute right-0 top-12 w-80 z-20 backdrop-blur-md bg-slate-900/60 border-l border-slate-700/50 p-4">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
        Satellite Detail
      </h2>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-xs text-slate-500">NORAD ID</span>
          <span className="text-xs text-slate-200 font-mono">{selectedId}</span>
        </div>
        <p className="text-xs text-slate-600 italic mt-4">
          Full detail populated from UCS join (Phase 4)
        </p>
        <p className="text-xs text-slate-600 italic">Next visual pass — Phase 4 stub</p>
      </div>
    </aside>
  );
}
