/** ECI state vector for a single satellite at a given epoch */
export interface StateVector {
  noradId: string;
  /** ECI X position in km */
  x: number;
  /** ECI Y position in km */
  y: number;
  /** ECI Z position in km */
  z: number;
  /** ECI X velocity in km/s */
  vx: number;
  /** ECI Y velocity in km/s */
  vy: number;
  /** ECI Z velocity in km/s */
  vz: number;
  epochJd: number;
}

/** Batch of state vectors for an ephemeris range */
export interface EphemerisBatch {
  noradId: string;
  /** Float64Array layout: [x0,y0,z0, x1,y1,z1, ...] */
  positions: Float64Array;
  /** Julian dates corresponding to each sample */
  epochs: Float64Array;
}

export type SatelliteStatus = "active" | "inactive" | "debris" | "unknown";

export interface SatelliteRenderMeta {
  noradId: string;
  name: string;
  status: SatelliteStatus;
  /** Slot index in the PointPrimitiveCollection */
  slotIndex: number;
}
