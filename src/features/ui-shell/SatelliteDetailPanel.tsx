import { useSelectionStore } from "@/shared/store/selection.store";
import { useUIStore } from "@/shared/store/ui.store";
import { resolveEntity } from "@/features/osint-intelligence";
import type { SatelliteMetadata } from "@/features/orbital-mechanics/types";

interface SatelliteDetailPanelProps {
  meta: SatelliteMetadata | null;
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[10px] text-slate-500 shrink-0">{label}</span>
      <span className="text-[10px] text-slate-300 font-mono text-right truncate">
        {String(value)}
      </span>
    </div>
  );
}

export function SatelliteDetailPanel({ meta }: SatelliteDetailPanelProps) {
  const selectedId = useSelectionStore((s) => s.selectedNoradId);
  const open = useUIStore((s) => s.detailPanelOpen);

  if (!open || !selectedId) return null;

  const ucs = resolveEntity(selectedId);

  return (
    <aside className="absolute right-0 top-12 w-72 z-20 backdrop-blur-md bg-slate-900/60 border-l border-slate-700/50 p-4 overflow-y-auto max-h-[calc(100vh-3rem)]">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
        Satellite Detail
      </h2>

      {/* Identity */}
      <div className="mb-3 space-y-1">
        <div
          className="text-sm font-semibold text-slate-200 truncate"
          title={meta?.name ?? ucs?.name}
        >
          {meta?.name ?? ucs?.name ?? selectedId}
        </div>
        <div className="text-[10px] font-mono text-space-accent">{selectedId}</div>
        {meta?.objectId && <div className="text-[10px] text-slate-500">{meta.objectId}</div>}
      </div>

      {/* Orbital parameters (from propagator) */}
      {meta && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Orbital Elements
          </p>
          <div className="space-y-1">
            <Row label="Epoch" value={meta.epoch.slice(0, 19).replace("T", " ")} />
            <Row label="Inclination" value={`${meta.inclinationDeg.toFixed(2)}°`} />
            <Row label="Eccentricity" value={meta.eccentricity.toFixed(6)} />
            <Row label="Mean Motion" value={`${meta.meanMotionRevPerDay.toFixed(4)} rev/day`} />
          </div>
        </div>
      )}

      {/* UCS enrichment */}
      {ucs ? (
        <div className="mb-3">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            UCS Database
          </p>
          <div className="space-y-1">
            <Row label="Operator" value={ucs.operator} />
            <Row label="Country" value={ucs.country} />
            <Row label="Purpose" value={ucs.purpose} />
            <Row label="Users" value={ucs.users} />
            <Row label="Launch Date" value={ucs.launchDate} />
            <Row
              label="Lifetime"
              value={ucs.expectedLifetimeYears != null ? `${ucs.expectedLifetimeYears} yr` : null}
            />
            <Row
              label="Launch Mass"
              value={ucs.launchMassKg != null ? `${ucs.launchMassKg.toLocaleString()} kg` : null}
            />
            <Row
              label="Perigee"
              value={ucs.perigeeKm != null ? `${ucs.perigeeKm.toLocaleString()} km` : null}
            />
            <Row
              label="Apogee"
              value={ucs.apogeeKm != null ? `${ucs.apogeeKm.toLocaleString()} km` : null}
            />
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-slate-600 italic mb-3">
          No UCS enrichment — load the UCS Satellite Database for operator / country / purpose data.
        </p>
      )}

      <p className="text-[10px] text-slate-600 italic">Next visual pass — Phase 4 stub</p>
    </aside>
  );
}
