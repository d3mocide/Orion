/**
 * Propagator smoke test — validates WASM SGP4 correctness and timing.
 *
 * Runs in Vitest (node environment). The WASM module is imported directly
 * here rather than via the worker, so we can assert on timing synchronously.
 *
 * wasm-bindgen's init() defaults to fetch(), which isn't available in Node.
 * We pass the .wasm binary as an ArrayBuffer read from disk instead.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = resolve(__dirname, "../wasm/orion_propagator_bg.wasm");

let wasm: typeof import("../wasm/orion_propagator");

beforeAll(async () => {
  wasm = await import("../wasm/orion_propagator");
  const wasmBytes = readFileSync(WASM_PATH);
  await wasm.default({ module_or_path: wasmBytes.buffer });
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** ISS OMM record — known-good values from CelesTrak */
const ISS_OMM = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: "2024-01-15T06:23:45.123456",
  MEAN_MOTION: 15.48919802,
  ECCENTRICITY: 0.0002536,
  INCLINATION: 51.6416,
  RA_OF_ASC_NODE: 247.4627,
  ARG_OF_PERICENTER: 130.536,
  MEAN_ANOMALY: 325.0288,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U",
  NORAD_CAT_ID: "25544",
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 43525,
  BSTAR: 0.00015311,
  MEAN_MOTION_DOT: 0.00016717,
  MEAN_MOTION_DDOT: 0,
};

function generateOMMBatch(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    ...ISS_OMM,
    OBJECT_NAME: `SAT-${i}`,
    NORAD_CAT_ID: String(25544 + i),
    MEAN_ANOMALY: (ISS_OMM.MEAN_ANOMALY + i * 0.1) % 360,
  }));
}

const nowJd = () => Date.now() / 86_400_000 + 2_440_587.5;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WASM SGP4 propagator", () => {
  it("parses OMM JSON and loads catalog", () => {
    const result = wasm.load_catalog(JSON.stringify([ISS_OMM])) as {
      accepted: number;
      rejected: number;
    };
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
    expect(wasm.catalog_size()).toBe(1);
  });

  it("NORAD_CAT_ID is preserved as string (not integer)", () => {
    wasm.load_catalog(JSON.stringify([ISS_OMM]));
    const meta = wasm.get_metadata("25544") as { norad_id: string } | null;
    expect(meta).not.toBeNull();
    expect(typeof meta!.norad_id).toBe("string");
    expect(meta!.norad_id).toBe("25544");
  });

  it("propagateAt returns 3N finite numbers for N objects", () => {
    wasm.load_catalog(JSON.stringify(generateOMMBatch(100)));
    const positions = wasm.propagate_at_jd(nowJd()) as Float64Array;
    expect(positions.length).toBe(300);

    // ISS-like orbit: r ≈ 6791 km
    const [x, y, z] = [positions[0], positions[1], positions[2]];
    const r = Math.sqrt(x * x + y * y + z * z);
    expect(r).toBeGreaterThan(6000);
    expect(r).toBeLessThan(8000);
  });

  it("propagates 10,000 objects in < 100ms (WASM in Node, no SIMD)", () => {
    wasm.load_catalog(JSON.stringify(generateOMMBatch(10_000)));

    const t0 = performance.now();
    const positions = wasm.propagate_at_jd(nowJd()) as Float64Array;
    const elapsed = performance.now() - t0;

    expect(positions.length).toBe(30_000);
    console.info(`[perf] 10k SGP4 propagation: ${elapsed.toFixed(1)}ms (node, no SIMD)`);
    // Node WASM is ~3-5× slower than browser; browser target is <16ms.
    expect(elapsed).toBeLessThan(100);
  });

  it("propagateRange returns 181 ECI positions for a 90-min ISS track", () => {
    wasm.load_catalog(JSON.stringify([ISS_OMM]));
    const jd = nowJd();
    // 90 minutes at 30-second steps = 181 samples
    const positions = wasm.propagate_range("25544", jd, jd + 90 / 1440, 30) as Float64Array;

    expect(positions.length).toBe(181 * 3);
    // Every non-zero position should be at a plausible orbital radius
    for (let i = 0; i < 181; i++) {
      const x = positions[i * 3],
        y = positions[i * 3 + 1],
        z = positions[i * 3 + 2];
      const r = Math.sqrt(x * x + y * y + z * z);
      if (r > 0) {
        expect(r).toBeGreaterThan(5000);
        expect(r).toBeLessThan(50_000);
      }
    }
  });
});
