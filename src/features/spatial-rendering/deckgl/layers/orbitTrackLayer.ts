/** Orbit track LineLayer — Phase 3 implementation stub. */

export interface OrbitTrackLayerOptions {
  noradId: string;
  /** Float64Array: [x0,y0,z0, x1,y1,z1, ...] ECI km positions */
  positions: Float64Array;
}

export function buildOrbitTrackData(_opts: OrbitTrackLayerOptions): unknown[] {
  // Phase 3: build source/target pairs for deck.gl LineLayer
  return [];
}
