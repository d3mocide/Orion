import { useEffect, useMemo, useState } from "react";
import { useSelectionStore } from "@/shared/store/selection.store";
import { useObserverStore } from "@/shared/store/observer.store";
import { useUIStore } from "@/shared/store/ui.store";
import { resolveEntity } from "@/features/osint-intelligence";
import {
  findPasses,
  samplesToTrack,
  dopplerSeries,
  dopplerCsv,
  type SatellitePass,
  type TrackPoint,
} from "@/features/ground-station/passPrediction";
import { semiMajorAxisKm, R_EARTH_KM } from "@/shared/utils/astro";
import {
  fetchTransmitters,
  formatFrequency,
  type Transmitter,
} from "@/features/telemetry-ingestion/clients/satnogs";
import type { PropagatorAPI, SatelliteMetadata } from "@/features/orbital-mechanics/types";
import { jdToDate, nowJd } from "@/shared/utils/time";
import { PolarPlot } from "./instruments/PolarPlot";
import { DopplerChart } from "./instruments/DopplerChart";

interface SatelliteDetailPanelProps {
  meta: SatelliteMetadata | null;
  propagator: PropagatorAPI | null;
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0 text-[10px] text-zinc-500">{label}</span>
      <span className="truncate text-right font-mono text-[10px] text-zinc-300">
        {String(value)}
      </span>
    </div>
  );
}

function Stat({ value, unit, accent }: { value: string; unit: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2 text-center">
      <div className={`font-mono text-sm ${accent ? "text-signal-pos" : "text-zinc-200"}`}>
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-600">{unit}</div>
    </div>
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
  return jdToDate(jd).toISOString().slice(11, 19) + "z";
}

function PassCard({
  pass,
  active,
  onSelect,
}: {
  pass: SatellitePass;
  active: boolean;
  onSelect: () => void;
}) {
  const now = Date.now();
  const aosMs = jdToDate(pass.aosJd).getTime() - now;
  const losMs = jdToDate(pass.losJd).getTime() - now;
  const durationMin = Math.round((pass.losJd - pass.aosJd) * 1440);
  const live = aosMs <= 0 && losMs > 0;
  const progress = live ? Math.min(1, -aosMs / (losMs - aosMs)) : 0;

  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-md border p-2 text-left transition-colors ${
        active
          ? "border-white/30 bg-white/[0.07]"
          : "border-white/[0.07] bg-white/[0.02] hover:border-white/20"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`font-mono text-[11px] ${live ? "text-signal-pos" : "text-zinc-200"}`}>
          {live ? "LIVE · LOS " + fmtCountdown(losMs) : fmtCountdown(aosMs)}
        </span>
        <span className="font-mono text-[10px] text-signal-warn">
          max {pass.maxElDeg.toFixed(0)}°
        </span>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-500">
        <span>
          {fmtTime(pass.aosJd)} az {pass.aosAzDeg.toFixed(0)}°
        </span>
        <span>
          {fmtTime(pass.losJd)} az {pass.losAzDeg.toFixed(0)}°
        </span>
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-[10px] text-zinc-600">
        <span>{durationMin} min</span>
        <span>closest {pass.minRangeKm.toFixed(0)} km</span>
      </div>
      {live && (
        <div className="mt-1.5 h-0.5 overflow-hidden rounded bg-white/10">
          <div className="h-full bg-signal-pos" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </button>
  );
}

function TransmitterCard({
  tx,
  onUseFrequency,
}: {
  tx: Transmitter;
  onUseFrequency: (hz: number) => void;
}) {
  const statusColor =
    tx.status === "active" ? "text-signal-pos" : tx.alive ? "text-signal-warn" : "text-zinc-600";
  return (
    <div className="rounded-md border border-white/[0.07] bg-white/[0.02] p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-zinc-200" title={tx.description}>
          {tx.description || tx.type}
        </span>
        <span className={`shrink-0 text-[9px] uppercase tracking-wider ${statusColor}`}>
          {tx.status}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-2 font-mono text-[10px] text-zinc-400">
        <button
          onClick={() => tx.downlinkLowHz && onUseFrequency(tx.downlinkLowHz)}
          disabled={!tx.downlinkLowHz}
          className="text-left hover:text-zinc-100 disabled:cursor-default disabled:hover:text-zinc-400"
          title="Use for Doppler analysis"
        >
          ↓ {formatFrequency(tx.downlinkLowHz)}
        </button>
        <span>↑ {formatFrequency(tx.uplinkLowHz)}</span>
        {tx.mode && <span className="text-zinc-300">{tx.mode}</span>}
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
  const simTimeJd = useUIStore((s) => s.simTimeJd);
  const observer = useObserverStore((s) => s.location);

  const [passes, setPasses] = useState<SatellitePass[] | null>(null);
  const [passIdx, setPassIdx] = useState(0);
  const [passTrack, setPassTrack] = useState<TrackPoint[] | null>(null);
  const [transmitters, setTransmitters] = useState<Transmitter[] | null>(null);
  const [freqHz, setFreqHz] = useState(137_500_000);

  // Pass search: 24 h ahead at 30 s steps
  useEffect(() => {
    setPasses(null);
    setPassIdx(0);
    if (!selectedId || !propagator || !observer) return;

    let cancelled = false;
    const jdStart = nowJd();
    void propagator.propagateRange(selectedId, jdStart, jdStart + 1, 30).then((buf) => {
      if (cancelled) return;
      const found = findPasses(
        { positions: new Float64Array(buf), jdStart, stepSec: 30 },
        observer,
      );
      setPasses(found.slice(0, 5));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, propagator, observer]);

  // Dense track for the selected pass → polar plot + Doppler
  const selectedPass = passes?.[passIdx] ?? null;
  useEffect(() => {
    setPassTrack(null);
    if (!selectedPass || !selectedId || !propagator || !observer) return;

    let cancelled = false;
    const pad = 30 / 86_400; // 30 s margin on each side
    const jdStart = selectedPass.aosJd - pad;
    const jdEnd = selectedPass.losJd + pad;
    const stepSec = Math.max(2, Math.round(((jdEnd - jdStart) * 86_400) / 240));

    void propagator.propagateRange(selectedId, jdStart, jdEnd, stepSec).then((buf) => {
      if (cancelled) return;
      const track = samplesToTrack(
        { positions: new Float64Array(buf), jdStart, stepSec },
        observer,
      );
      setPassTrack(track);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedPass, selectedId, propagator, observer]);

  // SatNOGS transmitters; seed the Doppler carrier from the first downlink
  useEffect(() => {
    setTransmitters(null);
    if (!selectedId) return;
    let cancelled = false;
    void fetchTransmitters(selectedId).then((tx) => {
      if (cancelled) return;
      setTransmitters(tx);
      const dl = tx.find((t) => t.downlinkLowHz);
      if (dl?.downlinkLowHz) setFreqHz(dl.downlinkLowHz);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const doppler = useMemo(
    () => (passTrack ? dopplerSeries(passTrack, freqHz) : null),
    [passTrack, freqHz],
  );

  const exportCsv = () => {
    if (!passTrack || !doppler || !selectedId) return;
    const blob = new Blob([dopplerCsv(passTrack, doppler)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doppler_${selectedId}_${jdToDate(passTrack[0].jd).toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open || !selectedId) return null;

  const ucs = resolveEntity(selectedId);
  const periodMin = meta ? 1440 / meta.meanMotionRevPerDay : null;
  const aKm = meta ? semiMajorAxisKm(meta.meanMotionRevPerDay) : null;
  const apogeeKm = meta && aKm ? aKm * (1 + meta.eccentricity) - R_EARTH_KM : null;
  const perigeeKm = meta && aKm ? aKm * (1 - meta.eccentricity) - R_EARTH_KM : null;

  return (
    <aside className="glass-panel absolute bottom-14 right-3 top-16 z-20 w-[22rem] overflow-y-auto rounded-lg p-4">
      {/* Identity */}
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className="truncate text-sm font-semibold text-zinc-100"
            title={meta?.name ?? ucs?.name}
          >
            {meta?.name ?? ucs?.name ?? selectedId}
          </div>
          <div className="font-mono text-[10px] text-zinc-500">
            {selectedId}
            {meta?.objectId ? ` · ${meta.objectId}` : ""}
            {liveStats?.eclipsed !== undefined && (
              <span className={liveStats.eclipsed ? "text-zinc-400" : "text-signal-warn"}>
                {" "}
                · {liveStats.eclipsed ? "ECLIPSED" : "SUNLIT"}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => select(null)}
          className="shrink-0 text-zinc-600 transition-colors hover:text-zinc-200"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Live state */}
      {liveStats && (
        <div className="mb-2 grid grid-cols-3 gap-2">
          <Stat value={liveStats.altKm.toFixed(0)} unit="alt km" />
          <Stat value={liveStats.velKms.toFixed(2)} unit="km/s" />
          {liveStats.elDeg !== null ? (
            <Stat
              value={`${liveStats.elDeg.toFixed(0)}°`}
              unit="elevation"
              accent={liveStats.elDeg > 0}
            />
          ) : (
            <Stat value="—" unit="elevation" />
          )}
        </div>
      )}
      {liveStats && (
        <div className="mb-4 font-mono text-[10px] text-zinc-500">
          subpoint {liveStats.latDeg.toFixed(2)}°, {liveStats.lonDeg.toFixed(2)}°
          {liveStats.azDeg != null && liveStats.rangeKm != null && (
            <>
              {" "}
              · az {liveStats.azDeg.toFixed(1)}° · range {liveStats.rangeKm.toFixed(0)} km
            </>
          )}
        </div>
      )}

      {/* Passes */}
      <div className="mb-4">
        <p className="panel-heading">Upcoming Passes</p>
        {!observer ? (
          <p className="text-[10px] italic leading-snug text-zinc-600">
            Set a ground station in the Mission panel to predict passes.
          </p>
        ) : passes === null ? (
          <p className="text-[10px] text-zinc-500">Computing…</p>
        ) : passes.length === 0 ? (
          <p className="text-[10px] italic text-zinc-600">No passes in the next 24 h.</p>
        ) : (
          <div className="space-y-1.5">
            {passes.map((p, i) => (
              <PassCard
                key={p.aosJd}
                pass={p}
                active={i === passIdx}
                onSelect={() => setPassIdx(i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Polar tracking plot */}
      {passTrack && passTrack.length > 1 && (
        <div className="mb-4">
          <p className="panel-heading">Polar Tracking Plot</p>
          <div className="rounded-md border border-white/[0.07] bg-black/20 p-2">
            <PolarPlot
              track={passTrack}
              liveAzDeg={liveStats?.azDeg ?? null}
              liveElDeg={liveStats?.elDeg ?? null}
            />
          </div>
        </div>
      )}

      {/* Doppler analysis */}
      {doppler && doppler.length > 1 && (
        <div className="mb-4">
          <p className="panel-heading">Doppler Shift Analysis</p>
          <div className="rounded-md border border-white/[0.07] bg-black/20 p-2">
            <div className="mb-2 flex items-center gap-2">
              <label className="text-[10px] text-zinc-500" htmlFor="doppler-freq">
                Freq (Hz)
              </label>
              <input
                id="doppler-freq"
                className="field flex-1"
                value={freqHz}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (isFinite(v) && v > 0) setFreqHz(v);
                }}
              />
            </div>
            <DopplerChart doppler={doppler} nowJd={simTimeJd} />
            <button onClick={exportCsv} className="chip mt-2 w-full px-2 py-1 text-[11px]">
              Export CSV
            </button>
          </div>
        </div>
      )}

      {/* RF transmitters */}
      <div className="mb-4">
        <p className="panel-heading">Transmitters · SatNOGS</p>
        {transmitters === null ? (
          <p className="text-[10px] text-zinc-500">Loading…</p>
        ) : transmitters.length === 0 ? (
          <p className="text-[10px] italic text-zinc-600">
            No RF records (offline or not in SatNOGS DB).
          </p>
        ) : (
          <div className="space-y-1.5">
            {transmitters.slice(0, 8).map((tx) => (
              <TransmitterCard key={tx.uuid} tx={tx} onUseFrequency={setFreqHz} />
            ))}
            {transmitters.length > 8 && (
              <p className="text-[10px] text-zinc-600">+{transmitters.length - 8} more</p>
            )}
          </div>
        )}
      </div>

      {/* Orbital elements */}
      {meta && (
        <div className="mb-4">
          <p className="panel-heading">Orbital Elements</p>
          <div className="space-y-1">
            <Row label="Epoch" value={meta.epoch.slice(0, 19).replace("T", " ")} />
            <Row label="Inclination" value={`${meta.inclinationDeg.toFixed(2)}°`} />
            <Row label="Eccentricity" value={meta.eccentricity.toFixed(6)} />
            <Row label="Mean motion" value={`${meta.meanMotionRevPerDay.toFixed(4)} rev/d`} />
            <Row label="Period" value={periodMin ? `${periodMin.toFixed(1)} min` : null} />
            <Row label="Apogee" value={apogeeKm != null ? `${apogeeKm.toFixed(0)} km` : null} />
            <Row label="Perigee" value={perigeeKm != null ? `${perigeeKm.toFixed(0)} km` : null} />
          </div>
        </div>
      )}

      {/* UCS enrichment */}
      {ucs && (
        <div>
          <p className="panel-heading">UCS Database</p>
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
