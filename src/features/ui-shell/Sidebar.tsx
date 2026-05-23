import { useUIStore } from "@/shared/store/ui.store";
import { FilterPanel } from "./FilterPanel";

export function Sidebar() {
  const open = useUIStore((s) => s.sidebarOpen);

  return (
    <aside
      className={`
        absolute left-0 top-12 bottom-0 w-72 z-20
        backdrop-blur-md bg-slate-900/60 border-r border-slate-700/50
        transition-transform duration-200
        ${open ? "translate-x-0" : "-translate-x-full"}
      `}
    >
      <div className="p-4 h-full overflow-y-auto">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
          Filters
        </h2>
        <FilterPanel />
      </div>
    </aside>
  );
}
