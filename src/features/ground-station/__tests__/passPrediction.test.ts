import { describe, it, expect } from "vitest";
import { findPasses, dopplerShiftHz } from "../passPrediction";
import { ecefToEci, WGS84_A_KM, type GeodeticLocation } from "@/shared/utils/astro";

const OBSERVER: GeodeticLocation = { latDeg: 0, lonDeg: 0, altKm: 0 };
const STEP_SEC = 30;

/**
 * Build a synthetic ECI sample buffer for a satellite traveling along the
 * observer's meridian plane in ECEF (so the geometry is exact regardless of
 * GMST): it rises from below the horizon, crosses the zenith, and sets.
 */
function overheadPassSamples(jdStart: number, nSamples: number): Float64Array {
  const positions = new Float64Array(nSamples * 3);
  const r = WGS84_A_KM + 800;
  for (let i = 0; i < nSamples; i++) {
    const jd = jdStart + (i * STEP_SEC) / 86_400;
    // Sweep ECEF latitude-like angle from -40° to +40° (overhead at 0°)
    const alpha = ((i / (nSamples - 1)) * 80 - 40) * (Math.PI / 180);
    const ecef = { x: r * Math.cos(alpha), y: 0, z: r * Math.sin(alpha) };
    const eci = ecefToEci(ecef, jd);
    positions[i * 3] = eci.x;
    positions[i * 3 + 1] = eci.y;
    positions[i * 3 + 2] = eci.z;
  }
  return positions;
}

describe("findPasses", () => {
  it("finds a single overhead pass with sane AOS/LOS ordering", () => {
    const jdStart = 2460700.25;
    const positions = overheadPassSamples(jdStart, 120);
    const passes = findPasses({ positions, jdStart, stepSec: STEP_SEC }, OBSERVER);

    expect(passes).toHaveLength(1);
    const p = passes[0];
    expect(p.aosJd).toBeLessThan(p.maxElJd);
    expect(p.maxElJd).toBeLessThan(p.losJd);
    expect(p.maxElDeg).toBeGreaterThan(80); // overhead
    expect(p.minRangeKm).toBeLessThan(900);
    expect(p.minRangeKm).toBeGreaterThan(700);
  });

  it("returns no passes for a satellite on the far side", () => {
    const jdStart = 2460700.25;
    const n = 120;
    const positions = new Float64Array(n * 3);
    const r = WGS84_A_KM + 800;
    for (let i = 0; i < n; i++) {
      const jd = jdStart + (i * STEP_SEC) / 86_400;
      const eci = ecefToEci({ x: -r, y: 0, z: 0 }, jd);
      positions[i * 3] = eci.x;
      positions[i * 3 + 1] = eci.y;
      positions[i * 3 + 2] = eci.z;
    }
    const passes = findPasses({ positions, jdStart, stepSec: STEP_SEC }, OBSERVER);
    expect(passes).toHaveLength(0);
  });

  it("skips zero (decayed) samples without crashing", () => {
    const jdStart = 2460700.25;
    const positions = new Float64Array(60 * 3); // all zeros
    const passes = findPasses({ positions, jdStart, stepSec: STEP_SEC }, OBSERVER);
    expect(passes).toHaveLength(0);
  });

  it("closes a pass still in progress at the end of the window", () => {
    const jdStart = 2460700.25;
    // Only the rising half: ends while still above the horizon
    const full = overheadPassSamples(jdStart, 120);
    const half = full.slice(0, 60 * 3);
    const passes = findPasses({ positions: half, jdStart, stepSec: STEP_SEC }, OBSERVER);
    expect(passes).toHaveLength(1);
    expect(passes[0].losJd).toBeGreaterThan(passes[0].aosJd);
  });
});

describe("dopplerShiftHz", () => {
  it("is positive (higher frequency) while approaching", () => {
    // Approaching = negative range rate
    expect(dopplerShiftHz(145_800_000, -7)).toBeGreaterThan(3000);
  });

  it("is zero at closest approach", () => {
    expect(dopplerShiftHz(145_800_000, 0)).toBeCloseTo(0, 12);
  });
});
