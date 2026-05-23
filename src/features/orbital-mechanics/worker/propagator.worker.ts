import { expose } from "comlink";
import type { OMMRecord } from "../types";
import type { PropagatorAPI, SatelliteMetadata } from "../types";

// Dynamic import so Vite can code-split the WASM module
// The `?url` suffix is NOT used here — wasm-pack's JS glue handles instantiation.
let wasmModule: typeof import("../wasm/orion_propagator") | null = null;

async function getWasm() {
  if (wasmModule) return wasmModule;
  const mod = await import("../wasm/orion_propagator");
  await mod.default(); // calls wasm-bindgen's init, fetches .wasm file
  wasmModule = mod;
  return mod;
}

const propagatorImpl: PropagatorAPI = {
  async loadCatalog(ommBatch: OMMRecord[]) {
    const wasm = await getWasm();
    // Serialize OMM batch to JSON string — sgp4 crate deserializes directly
    // This is the only JSON.stringify in the hot path and it's NOT per-frame.
    const json = JSON.stringify(ommBatch);
    const result = wasm.load_catalog(json) as { accepted: number; rejected: number };
    return { accepted: result.accepted, rejected: result.rejected };
  },

  async propagateAt(jdUtc: number): Promise<ArrayBuffer> {
    const wasm = await getWasm();
    // Returns a JS-owned Float64Array. We copy its buffer and transfer it.
    const positions: Float64Array = wasm.propagate_at_jd(jdUtc);
    // .slice() creates a copy — the original stays in WASM memory
    const transferable = positions.slice().buffer;
    return transferable;
  },

  async propagateRange(
    noradId: string,
    jdStart: number,
    jdEnd: number,
    stepSec: number,
  ): Promise<ArrayBuffer> {
    const wasm = await getWasm();
    const positions: Float64Array = wasm.propagate_range(noradId, jdStart, jdEnd, stepSec);
    return positions.slice().buffer;
  },

  async getMetadata(noradId: string): Promise<SatelliteMetadata | null> {
    const wasm = await getWasm();
    const meta = wasm.get_metadata(noradId) as SatelliteMetadata | null;
    return meta ?? null;
  },

  async getCatalogSize(): Promise<number> {
    const wasm = await getWasm();
    return wasm.catalog_size();
  },
};

expose(propagatorImpl);
