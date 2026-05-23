import type { OMMRecord } from "@/shared/types/omm";
import type { StateVector, EphemerisBatch } from "@/shared/types/rendering";

export type { OMMRecord, StateVector, EphemerisBatch };

export interface SatelliteMetadata {
  noradId: string;
  name: string;
  objectId: string;
  epoch: string;
  inclinationDeg: number;
  eccentricity: number;
  meanMotionRevPerDay: number;
}

export interface PropagatorAPI {
  loadCatalog(ommBatch: OMMRecord[]): Promise<{ accepted: number; rejected: number }>;
  /** Returns Float64Array.buffer: [x0,y0,z0, x1,y1,z1, ...] ECI km, Transferable */
  propagateAt(jdUtc: number): Promise<ArrayBuffer>;
  /** Returns Float64Array.buffer: [x0,y0,z0, x1,y1,z1, ...] for one satellite over time */
  propagateRange(
    noradId: string,
    jdStart: number,
    jdEnd: number,
    stepSec: number,
  ): Promise<ArrayBuffer>;
  getMetadata(noradId: string): Promise<SatelliteMetadata | null>;
  getCatalogSize(): Promise<number>;
}

export interface CatalogLoadResult {
  accepted: number;
  rejected: number;
}
