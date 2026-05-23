import { expose } from "comlink";
import type { OMMRecord } from "../types";
import type { PropagatorAPI, SatelliteMetadata } from "../types";

/** Phase 1 stub: pure-JS two-body approximation.
 *  Replaced in Phase 2 by Rust/WASM SGP4. */

interface CatalogEntry {
  noradId: string;
  name: string;
  objectId: string;
  epoch: string;
  inclinationDeg: number;
  eccentricity: number;
  meanMotionRevPerDay: number;
  bstar: number;
  raAscNodeDeg: number;
  argPericenterDeg: number;
  meanAnomalyDeg0: number;
  epochJd: number;
}

const DEG2RAD = Math.PI / 180;
const GM_EARTH = 398600.4418; // km³/s²
const EARTH_RADIUS_KM = 6371.0;

function epochIsoToJd(epoch: string): number {
  return new Date(epoch).getTime() / 86_400_000 + 2_440_587.5;
}

function meanMotionToSma(meanMotionRevPerDay: number): number {
  const n = (meanMotionRevPerDay * 2 * Math.PI) / 86400;
  return Math.cbrt(GM_EARTH / (n * n));
}

let catalog: CatalogEntry[] = [];

const propagatorImpl: PropagatorAPI = {
  async loadCatalog(ommBatch: OMMRecord[]) {
    let accepted = 0;
    let rejected = 0;

    catalog = [];
    for (const omm of ommBatch) {
      try {
        const entry: CatalogEntry = {
          noradId: omm.NORAD_CAT_ID,
          name: omm.OBJECT_NAME,
          objectId: omm.OBJECT_ID,
          epoch: omm.EPOCH,
          inclinationDeg: omm.INCLINATION,
          eccentricity: omm.ECCENTRICITY,
          meanMotionRevPerDay: omm.MEAN_MOTION,
          bstar: omm.BSTAR,
          raAscNodeDeg: omm.RA_OF_ASC_NODE,
          argPericenterDeg: omm.ARG_OF_PERICENTER,
          meanAnomalyDeg0: omm.MEAN_ANOMALY,
          epochJd: epochIsoToJd(omm.EPOCH),
        };
        catalog.push(entry);
        accepted++;
      } catch {
        rejected++;
      }
    }

    return { accepted, rejected };
  },

  async propagateAt(jdUtc: number): Promise<ArrayBuffer> {
    const n = catalog.length;
    const buf = new Float64Array(n * 3);

    for (let i = 0; i < n; i++) {
      const sat = catalog[i];
      const dtSec = (jdUtc - sat.epochJd) * 86400;
      const sma = meanMotionToSma(sat.meanMotionRevPerDay);
      const n_rad = (sat.meanMotionRevPerDay * 2 * Math.PI) / 86400;

      // Simple two-body Kepler propagation (placeholder for SGP4)
      const M0 = sat.meanAnomalyDeg0 * DEG2RAD;
      const M = M0 + n_rad * dtSec;
      const e = sat.eccentricity;

      // Solve Kepler's equation E - e*sin(E) = M via Newton's method
      let E = M;
      for (let iter = 0; iter < 10; iter++) {
        E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      }

      const cosE = Math.cos(E);
      const sinE = Math.sin(E);
      const sqrtOme2 = Math.sqrt(1 - e * e);

      // Position in perifocal frame
      const xPeri = sma * (cosE - e);
      const yPeri = sma * sqrtOme2 * sinE;

      // Rotate to ECI
      const raan = sat.raAscNodeDeg * DEG2RAD;
      const argP = sat.argPericenterDeg * DEG2RAD;
      const inc = sat.inclinationDeg * DEG2RAD;

      const cosRaan = Math.cos(raan);
      const sinRaan = Math.sin(raan);
      const cosArgP = Math.cos(argP);
      const sinArgP = Math.sin(argP);
      const cosInc = Math.cos(inc);
      const sinInc = Math.sin(inc);

      const Qxx = cosRaan * cosArgP - sinRaan * sinArgP * cosInc;
      const Qxy = -cosRaan * sinArgP - sinRaan * cosArgP * cosInc;
      const Qyx = sinRaan * cosArgP + cosRaan * sinArgP * cosInc;
      const Qyy = -sinRaan * sinArgP + cosRaan * cosArgP * cosInc;
      const Qzx = sinArgP * sinInc;
      const Qzy = cosArgP * sinInc;

      let x = Qxx * xPeri + Qxy * yPeri;
      let y = Qyx * xPeri + Qyy * yPeri;
      let z = Qzx * xPeri + Qzy * yPeri;

      // Sanity check: if too close to Earth centre, mark as invalid (0,0,0)
      const r = Math.sqrt(x * x + y * y + z * z);
      if (!isFinite(r) || r < EARTH_RADIUS_KM) {
        x = 0;
        y = 0;
        z = 0;
      }

      buf[i * 3] = x;
      buf[i * 3 + 1] = y;
      buf[i * 3 + 2] = z;
    }

    return buf.buffer;
  },

  async propagateRange(
    noradId: string,
    jdStart: number,
    jdEnd: number,
    stepSec: number,
  ): Promise<ArrayBuffer> {
    const sat = catalog.find((c) => c.noradId === noradId);
    if (!sat) return new Float64Array(0).buffer;

    const numSteps = Math.floor(((jdEnd - jdStart) * 86400) / stepSec) + 1;
    const buf = new Float64Array(numSteps * 3);

    const sma = meanMotionToSma(sat.meanMotionRevPerDay);
    const n_rad = (sat.meanMotionRevPerDay * 2 * Math.PI) / 86400;
    const e = sat.eccentricity;

    const cosRaan = Math.cos(sat.raAscNodeDeg * DEG2RAD);
    const sinRaan = Math.sin(sat.raAscNodeDeg * DEG2RAD);
    const cosArgP = Math.cos(sat.argPericenterDeg * DEG2RAD);
    const sinArgP = Math.sin(sat.argPericenterDeg * DEG2RAD);
    const cosInc = Math.cos(sat.inclinationDeg * DEG2RAD);
    const sinInc = Math.sin(sat.inclinationDeg * DEG2RAD);

    const Qxx = cosRaan * cosArgP - sinRaan * sinArgP * cosInc;
    const Qxy = -cosRaan * sinArgP - sinRaan * cosArgP * cosInc;
    const Qyx = sinRaan * cosArgP + cosRaan * sinArgP * cosInc;
    const Qyy = -sinRaan * sinArgP + cosRaan * cosArgP * cosInc;
    const Qzx = sinArgP * sinInc;
    const Qzy = cosArgP * sinInc;

    for (let step = 0; step < numSteps; step++) {
      const dtSec = (jdStart - sat.epochJd) * 86400 + step * stepSec;
      const M0 = sat.meanAnomalyDeg0 * DEG2RAD;
      const M = M0 + n_rad * dtSec;
      let E = M;
      for (let iter = 0; iter < 10; iter++) {
        E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      }
      const xPeri = sma * (Math.cos(E) - e);
      const yPeri = sma * Math.sqrt(1 - e * e) * Math.sin(E);
      buf[step * 3] = Qxx * xPeri + Qxy * yPeri;
      buf[step * 3 + 1] = Qyx * xPeri + Qyy * yPeri;
      buf[step * 3 + 2] = Qzx * xPeri + Qzy * yPeri;
    }

    return buf.buffer;
  },

  async getMetadata(noradId: string): Promise<SatelliteMetadata | null> {
    const sat = catalog.find((c) => c.noradId === noradId);
    if (!sat) return null;
    return {
      noradId: sat.noradId,
      name: sat.name,
      objectId: sat.objectId,
      epoch: sat.epoch,
      inclinationDeg: sat.inclinationDeg,
      eccentricity: sat.eccentricity,
      meanMotionRevPerDay: sat.meanMotionRevPerDay,
    };
  },

  async getCatalogSize(): Promise<number> {
    return catalog.length;
  },
};

expose(propagatorImpl);
