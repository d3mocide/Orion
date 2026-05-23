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

/** Phase 4: will use @tanstack/react-virtual for 10k+ rows.
 *  Phase 1: simple capped list to avoid DOM pressure. */
export function VirtualizedCatalogTable({ rows }: VirtualizedCatalogTableProps) {
  const open = useUIStore((s) => s.catalogDrawerOpen);
  const select = useSelectionStore((s) => s.select);

  if (!open) return null;

  const displayed = rows.slice(0, 200); // Phase 1 cap — virtual scroll in Phase 4

  return (
    <div className="absolute bottom-0 left-0 right-0 h-48 z-20 backdrop-blur-md bg-slate-900/80 border-t border-slate-700/50">
      <div className="flex items-center px-4 h-8 border-b border-slate-700/50">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          Catalog ({rows.length.toLocaleString()} objects)
        </span>
      </div>
      <div className="overflow-y-auto h-40">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900/90">
            <tr>
              <th className="text-left px-4 py-1 text-slate-500 font-normal">NORAD ID</th>
              <th className="text-left px-4 py-1 text-slate-500 font-normal">Name</th>
              <th className="text-left px-4 py-1 text-slate-500 font-normal">Epoch</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((row) => (
              <tr
                key={row.noradId}
                onClick={() => select(row.noradId)}
                className="hover:bg-slate-700/30 cursor-pointer"
              >
                <td className="px-4 py-0.5 font-mono text-slate-300">{row.noradId}</td>
                <td className="px-4 py-0.5 text-slate-300">{row.name}</td>
                <td className="px-4 py-0.5 text-slate-500">{row.epoch.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
