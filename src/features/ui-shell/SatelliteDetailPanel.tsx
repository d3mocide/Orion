import { useEffect, useState } from "react";
import { useSelectionStore } from "@/shared/store/selection.store";
import { useObserverStore } from "@/shared/store/observer.store";
import { useUIStore } from "@/shared/store/ui.store";
import { resolveEntity } from "@/features/osint-intelligence";
import { findPasses, type SatellitePass } from "@/features/ground-station/passPrediction";
import {
  fetchTransmitters,
  formatFrequency,
  type Transmitter,
} from "@/features/telemetry-ingestion/clients/satnogs";
import type { PropagatorAPI, SatelliteMetadata } from "@/features/orbital-mechanics/types";
import { jdToDate, nowJd } from "@/shared/utils/time";

interface SatelliteDetailPanelProps {
  meta: SatelliteMetadata | null;
  propagator: PropagatorAPI | null;
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0 text-[10px] text-slate-500">{label}</span>
      <span className="truncate text-right font-mono text-[10px] text-slate-300">
        {String(value)}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
      {children}
    </p>
  );
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

function fmtTime(jd: number): string {
  return jdToDate(jd).toISOString().slice(11, 16) + "z";
}

function PassCard({ pass }: { pass: SatellitePass }) {
  const now = Date.now();
  const aosMs = jdToDate(pass.aosJd).getTime() - now;
  const losMs = jdToDate(pass.losJd).getTime() - now;
  const durationMin = Math.round((pass.losJd - pass.aosJd) * 1440);
  const live = aosMs <= 0 && losMs > 0;

  return (
    <div
      className={`rounded-lg border p-2 ${
        live ? "border-aurora-teal/60 bg-aurora-teal/10" : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`font-mono text-[11px] ${live ? "text-aurora-teal" : "text-slate-200"}`}>
          {live ? "LIVE — LOS " + fmtCountdown(losMs) : fmtCountdown(aosMs)}
        </span>
        <span className="font-mono text-[10px] text-aurora-amber">
          max {pass.maxElDeg.toFixed(0)}°
        </span>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400">
        <span>
          AOS {fmtTime(pass.aosJd)} az {pass.aosAzDeg.toFixed(0)}°
        </span>
        <span>
          LOS {fmtTime(pass.losJd)} az {pass.losAzDeg.toFixed(0)}°
        </span>
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-[10px] text-slate-500">
        <span>{durationMin} min</span>
        <span>closest {pass.minRangeKm.toFixed(0)} km</span>
      </div>
    </div>
  );
}

function TransmitterCard({ tx }: { tx: Transmitter }) {
  const statusColor =
    tx.status === "active" ? "text-aurora-teal" : tx.alive ? "text-aurora-amber" : "text-slate-500";
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-slate-200" title={tx.description}>
          {tx.description || tx.type}
        </span>
        <span className={`shrink-0 text-[9px] uppercase tracking-wider ${statusColor}`}>
          {tx.status}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-2 font-mono text-[10px] text-slate-400">
        <span>↓ {formatFrequency(tx.downlinkLowHz)}</span>
        <span>↑ {formatFrequency(tx.uplinkLowHz)}</span>
        {tx.mode && <span className="text-aurora-violet">{tx.mode}</span>}
        {tx.baud != null && <span>{tx.baud} bd</span>}
      </div>
    </div>
  );
}

export function SatelliteDetailPanel({ meta, propagator }: SatelliteDetailPanelProps) {
  const selectedId = useSelectionStore((s) => s.selectedNoradId);
  const liveStats = useSelectionStore((s) => s.liveStats);
  const select = useSelectionStore((s) => s.select);
  const open = useUIStore((s) => s.detailPanelOpen);
  const observer = useObserverStore((s) => s.location);

  const [passes, setPasses] = useState<SatellitePass[] | null>(null);
  const [transmitters, setTransmitters] = useState<Transmitter[] | null>(null);

  // Pass prediction: propagate 24h ahead at 30s steps, scan for horizon crossings
  useEffect(() => {
    setPasses(null);
    if (!selectedId || !propagator || !observer) return;

    let cancelled = false;
    const jdStart = nowJd();
    void propagator.propagateRange(selectedId, jdStart, jdStart + 1, 30).then((buf) => {
      if (cancelled) return;
      const found = findPasses(
        { positions: new Float64Array(buf), jdStart, stepSec: 30 },
        observer,
      );
      setPasses(found.slice(0, 4));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, propagator, observer]);

  // SatNOGS transmitters (24h IndexedDB cache; [] = confirmed none/offline)
  useEffect(() => {
    setTransmitters(null);
    if (!selectedId) return;
    let cancelled = false;
    void fetchTransmitters(selectedId).then((tx) => {
      if (!cancelled) setTransmitters(tx);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (!open || !selectedId) return null;

  const ucs = resolveEntity(selectedId);
  const periodMin = meta ? 1440 / meta.meanMotionRevPerDay : null;

  return (
    <aside className="glass-panel absolute bottom-16 right-3 top-16 z-20 w-80 overflow-y-auto rounded-xl p-4">
      {/* Identity */}
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className="truncate text-sm font-semibold text-slate-100"
            title={meta?.name ?? ucs?.name}
          >
            {meta?.name ?? ucs?.name ?? selectedId}
          </div>
          <div className="font-mono text-[10px] text-aurora-teal">
            {selectedId}
            {meta?.objectId ? ` · ${meta.objectId}` : ""}
          </div>
        </div>
        <button
          onClick={() => select(null)}
          className="shrink-0 text-slate-500 transition-colors hover:text-slate-200"
        >
          ✕
        </button>
      </div>

      {/* Live state */}
      {liveStats && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-center">
            <div className="font-mono text-sm text-aurora-teal">{liveStats.altKm.toFixed(0)}</div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">alt km</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-center">
            <div className="font-mono text-sm text-aurora-violet">
              {liveStats.velKms.toFixed(2)}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500">km/s</div>
          </div>
          {liveStats.elDeg !== null ? (
            <div
              className={`rounded-lg border p-2 text-center ${
                liveStats.elDeg > 0
                  ? "border-aurora-teal/60 bg-aurora-teal/10"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <div
                className={`font-mono text-sm ${liveStats.elDeg > 0 ? "text-aurora-teal" : "text-slate-400"}`}
              >
                {liveStats.elDeg.toFixed(0)}°
              </div>
              <div className="text-[9px] uppercase tracking-wider text-slate-500">elevation</div>
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-center">
              <div className="font-mono text-sm text-slate-600">—</div>
              <div className="text-[9px] uppercase tracking-wider text-slate-600">el</div>
            </div>
          )}
        </div>
      )}

      {liveStats?.azDeg != null && liveStats.elDeg != null && (
        <div className="mb-4 font-mono text-[11px] text-slate-400">
          az {liveStats.azDeg.toFixed(1)}° · el {liveStats.elDeg.toFixed(1)}° · range{" "}
          {liveStats.rangeKm?.toFixed(0)} km
        </div>
      )}

      {/* Next passes */}
      <div className="mb-4">
        <SectionTitle>Next Passes</SectionTitle>
        {!observer ? (
          <p className="text-[10px] italic leading-snug text-slate-600">
            Set a ground station in the Mission panel to predict passes.
          </p>
        ) : passes === null ? (
          <p className="text-[10px] text-slate-500">Computing…</p>
        ) : passes.length === 0 ? (
          <p className="text-[10px] italic text-slate-600">No passes in the next 24 h.</p>
        ) : (
          <div className="space-y-2">
            {passes.map((p) => (
              <PassCard key={p.aosJd} pass={p} />
            ))}
          </div>
        )}
      </div>

      {/* RF transmitters */}
      <div className="mb-4">
        <SectionTitle>Transmitters · SatNOGS</SectionTitle>
        {transmitters === null ? (
          <p className="text-[10px] text-slate-500">Loading…</p>
        ) : transmitters.length === 0 ? (
          <p className="text-[10px] italic text-slate-600">
            No RF records (offline or not in SatNOGS DB).
          </p>
        ) : (
          <div className="space-y-2">
            {transmitters.slice(0, 8).map((tx) => (
              <TransmitterCard key={tx.uuid} tx={tx} />
            ))}
            {transmitters.length > 8 && (
              <p className="text-[10px] text-slate-600">+{transmitters.length - 8} more</p>
            )}
          </div>
        )}
      </div>

      {/* Orbital elements */}
      {meta && (
        <div className="mb-4">
          <SectionTitle>Orbital Elements</SectionTitle>
          <div className="space-y-1">
            <Row label="Epoch" value={meta.epoch.slice(0, 19).replace("T", " ")} />
            <Row label="Inclination" value={`${meta.inclinationDeg.toFixed(2)}°`} />
            <Row label="Eccentricity" value={meta.eccentricity.toFixed(6)} />
            <Row label="Mean motion" value={`${meta.meanMotionRevPerDay.toFixed(4)} rev/d`} />
            <Row label="Period" value={periodMin ? `${periodMin.toFixed(1)} min` : null} />
          </div>
        </div>
      )}

      {/* UCS enrichment */}
      {ucs && (
        <div>
          <SectionTitle>UCS Database</SectionTitle>
          <div className="space-y-1">
            <Row label="Operator" value={ucs.operator} />
            <Row label="Country" value={ucs.country} />
            <Row label="Purpose" value={ucs.purpose} />
            <Row label="Users" value={ucs.users} />
            <Row label="Launched" value={ucs.launchDate} />
            <Row
              label="Mass"
              value={ucs.launchMassKg != null ? `${ucs.launchMassKg.toLocaleString()} kg` : null}
            />
          </div>
        </div>
      )}
    </aside>
  );
}
