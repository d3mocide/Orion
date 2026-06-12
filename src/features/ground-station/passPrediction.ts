/**
 * Satellite pass prediction for a ground observer.
 *
 * Works on ECI sample buffers produced by the WASM propagator
 * (`propagateRange` → Float64Array [x0,y0,z0, x1,y1,z1, ...] km), so all SGP4
 * math stays in the worker (C3). This module only does geometry: ECI → look
 * angles per sample, then scans for horizon crossings.
 */

import { lookAnglesFromEci, type GeodeticLocation, type Vec3 } from "@/shared/utils/astro";

export interface SatellitePass {
  /** Acquisition of signal — Julian Date when elevation crosses above 0° */
  aosJd: number;
  /** Loss of signal — Julian Date when elevation crosses back below 0° */
  losJd: number;
  /** Julian Date of maximum elevation */
  maxElJd: number;
  maxElDeg: number;
  aosAzDeg: number;
  losAzDeg: number;
  /** Slant range at closest approach, km */
  minRangeKm: number;
}

export interface PassSearchSamples {
  /** ECI positions [x,y,z,...] in km, one triple per step */
  positions: Float64Array;
  /** Julian Date of the first sample */
  jdStart: number;
  /** Seconds between samples */
  stepSec: number;
}

function sampleEci(positions: Float64Array, i: number): Vec3 {
  return { x: positions[i * 3], y: positions[i * 3 + 1], z: positions[i * 3 + 2] };
}

/**
 * Scan a propagated sample buffer for passes over `observer`.
 *
 * AOS/LOS instants are linearly interpolated between bracketing samples, so a
 * 30–60 s step gives AOS/LOS to within a few seconds — fine for VHF/UHF work.
 * Samples with zero magnitude (decayed/failed propagation) are skipped.
 */
export function findPasses(
  samples: PassSearchSamples,
  observer: GeodeticLocation,
): SatellitePass[] {
  const { positions, jdStart, stepSec } = samples;
  const stepJd = stepSec / 86_400;
  const n = Math.floor(positions.length / 3);
  const passes: SatellitePass[] = [];

  let inPass = false;
  let aosJd = 0;
  let aosAzDeg = 0;
  let maxElDeg = -90;
  let maxElJd = 0;
  let minRangeKm = Infinity;
  let prevEl = -90;
  let prevJd = jdStart;
  let prevAz = 0;

  for (let i = 0; i < n; i++) {
    const eci = sampleEci(positions, i);
    if (eci.x === 0 && eci.y === 0 && eci.z === 0) continue;

    const jd = jdStart + i * stepJd;
    const { azDeg, elDeg, rangeKm } = lookAnglesFromEci(eci, observer, jd);

    if (!inPass && elDeg > 0) {
      inPass = true;
      // Interpolate the AOS instant between the previous (below-horizon) sample
      // and this one. First-sample edge case: pass already in progress.
      if (i > 0 && prevEl <= 0 && elDeg !== prevEl) {
        const f = -prevEl / (elDeg - prevEl);
        aosJd = prevJd + f * (jd - prevJd);
      } else {
        aosJd = jd;
      }
      aosAzDeg = azDeg;
      maxElDeg = -90;
      maxElJd = jd;
      minRangeKm = Infinity;
    }

    if (inPass) {
      if (elDeg > maxElDeg) {
        maxElDeg = elDeg;
        maxElJd = jd;
      }
      if (rangeKm < minRangeKm) minRangeKm = rangeKm;

      if (elDeg <= 0) {
        const f = prevEl / (prevEl - elDeg);
        const losJd = prevJd + f * (jd - prevJd);
        passes.push({
          aosJd,
          losJd,
          maxElJd,
          maxElDeg,
          aosAzDeg,
          losAzDeg: azDeg,
          minRangeKm,
        });
        inPass = false;
      }
    }

    prevEl = elDeg;
    prevJd = jd;
    prevAz = azDeg;
  }

  // Pass still in progress at the end of the window — close it at the last sample
  if (inPass) {
    passes.push({
      aosJd,
      losJd: prevJd,
      maxElJd,
      maxElDeg,
      aosAzDeg,
      losAzDeg: prevAz,
      minRangeKm,
    });
  }

  return passes;
}

/** Doppler shift in Hz for a transmitter at `freqHz`, given range rate in km/s. */
export function dopplerShiftHz(freqHz: number, rangeRateKmS: number): number {
  const C_KM_S = 299_792.458;
  return -freqHz * (rangeRateKmS / C_KM_S);
}

export interface TrackPoint {
  jd: number;
  azDeg: number;
  elDeg: number;
  rangeKm: number;
}

/**
 * Convert an ECI sample buffer into observer-relative track points
 * (azimuth/elevation/range per sample). Zero samples are skipped.
 */
export function samplesToTrack(
  samples: PassSearchSamples,
  observer: GeodeticLocation,
): TrackPoint[] {
  const { positions, jdStart, stepSec } = samples;
  const n = Math.floor(positions.length / 3);
  const out: TrackPoint[] = [];
  for (let i = 0; i < n; i++) {
    const eci = sampleEci(positions, i);
    if (eci.x === 0 && eci.y === 0 && eci.z === 0) continue;
    const jd = jdStart + (i * stepSec) / 86_400;
    const look = lookAnglesFromEci(eci, observer, jd);
    out.push({ jd, azDeg: look.azDeg, elDeg: look.elDeg, rangeKm: look.rangeKm });
  }
  return out;
}

export interface DopplerPoint {
  jd: number;
  /** Range rate, km/s (negative = approaching) */
  rangeRateKmS: number;
  /** Doppler shift at the given carrier, Hz */
  shiftHz: number;
  /** Observed frequency, Hz */
  observedHz: number;
}

/**
 * Doppler curve for a carrier frequency over a track. Range rate comes from
 * central differences of slant range — the same quantity a receiver sees —
 * so light-time and frame subtleties cancel to first order.
 */
export function dopplerSeries(track: TrackPoint[], freqHz: number): DopplerPoint[] {
  const out: DopplerPoint[] = [];
  for (let i = 0; i < track.length; i++) {
    const prev = track[Math.max(0, i - 1)];
    const next = track[Math.min(track.length - 1, i + 1)];
    const dtSec = (next.jd - prev.jd) * 86_400;
    if (dtSec <= 0) continue;
    const rangeRateKmS = (next.rangeKm - prev.rangeKm) / dtSec;
    const shiftHz = dopplerShiftHz(freqHz, rangeRateKmS);
    out.push({ jd: track[i].jd, rangeRateKmS, shiftHz, observedHz: freqHz + shiftHz });
  }
  return out;
}

/** Serialize a Doppler series as CSV (UTC ISO timestamps). */
export function dopplerCsv(track: TrackPoint[], doppler: DopplerPoint[]): string {
  const lines = ["utc,az_deg,el_deg,range_km,range_rate_km_s,doppler_hz,observed_hz"];
  const byJd = new Map(doppler.map((d) => [d.jd, d]));
  for (const p of track) {
    const d = byJd.get(p.jd);
    if (!d) continue;
    const utc = new Date((p.jd - 2_440_587.5) * 86_400_000).toISOString();
    lines.push(
      `${utc},${p.azDeg.toFixed(2)},${p.elDeg.toFixed(2)},${p.rangeKm.toFixed(2)},${d.rangeRateKmS.toFixed(4)},${d.shiftHz.toFixed(1)},${d.observedHz.toFixed(1)}`,
    );
  }
  return lines.join("\n");
}
