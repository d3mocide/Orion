/**
 * Synthetic demo constellation — used when CelesTrak is unreachable and the
 * IndexedDB cache is empty (first run offline, e2e tests, air-gapped demos).
 *
 * Records are physically plausible OMM elements with epoch = now, so the WASM
 * SGP4 engine propagates them like real satellites. IDs use the 900xxx analyst
 * range to make their synthetic origin obvious.
 */

import type { OMMRecord } from "@/shared/types/omm";

/** Deterministic PRNG (mulberry32) so demo renders identically across loads */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MU_KM3_S2 = 398_600.4418;
const R_EARTH_KM = 6371.0;

/** Mean motion (rev/day) for a circular orbit at the given altitude */
function meanMotionForAltKm(altKm: number): number {
  const a = R_EARTH_KM + altKm;
  const periodSec = 2 * Math.PI * Math.sqrt((a * a * a) / MU_KM3_S2);
  return 86_400 / periodSec;
}

interface ShellSpec {
  namePrefix: string;
  count: number;
  altKm: number;
  altJitterKm: number;
  incDeg: number;
  ecc: number;
  planes: number;
}

const SHELLS: ShellSpec[] = [
  {
    namePrefix: "DEMO-LEO-POLAR",
    count: 320,
    altKm: 550,
    altJitterKm: 40,
    incDeg: 97.6,
    ecc: 0.0008,
    planes: 16,
  },
  {
    namePrefix: "DEMO-LEO-MID",
    count: 480,
    altKm: 540,
    altJitterKm: 30,
    incDeg: 53.2,
    ecc: 0.0005,
    planes: 24,
  },
  {
    namePrefix: "DEMO-LEO-ISS",
    count: 60,
    altKm: 420,
    altJitterKm: 15,
    incDeg: 51.6,
    ecc: 0.0004,
    planes: 6,
  },
  {
    namePrefix: "DEMO-MEO-NAV",
    count: 90,
    altKm: 20_200,
    altJitterKm: 100,
    incDeg: 55.0,
    ecc: 0.001,
    planes: 6,
  },
  {
    namePrefix: "DEMO-GEO",
    count: 80,
    altKm: 35_786,
    altJitterKm: 10,
    incDeg: 0.05,
    ecc: 0.0002,
    planes: 1,
  },
  {
    namePrefix: "DEMO-MOLNIYA",
    count: 24,
    altKm: 0,
    altJitterKm: 0,
    incDeg: 63.4,
    ecc: 0.74,
    planes: 3,
  },
];

/** Build the synthetic catalog with element epochs set to `now`. */
export function buildDemoCatalog(now: Date = new Date()): OMMRecord[] {
  const rand = mulberry32(1969);
  const epoch = now.toISOString().replace("Z", "");
  const records: OMMRecord[] = [];
  let idCounter = 900_001;

  for (const shell of SHELLS) {
    for (let i = 0; i < shell.count; i++) {
      const plane = i % shell.planes;
      const raan = (360 / shell.planes) * plane + rand() * 4;
      const phase = (360 / Math.ceil(shell.count / shell.planes)) * Math.floor(i / shell.planes);

      let meanMotion: number;
      if (shell.namePrefix === "DEMO-MOLNIYA") {
        meanMotion = 2.00642 + (rand() - 0.5) * 0.0004; // 12h critically-inclined
      } else {
        const alt = shell.altKm + (rand() - 0.5) * 2 * shell.altJitterKm;
        meanMotion = meanMotionForAltKm(alt);
      }

      records.push({
        OBJECT_NAME: `${shell.namePrefix}-${String(i + 1).padStart(3, "0")}`,
        OBJECT_ID: `2026-${String(900 + (idCounter % 99)).padStart(3, "0")}A`,
        EPOCH: epoch,
        MEAN_MOTION: meanMotion,
        ECCENTRICITY: shell.ecc * (0.8 + rand() * 0.4),
        INCLINATION: shell.incDeg + (rand() - 0.5) * 0.2,
        RA_OF_ASC_NODE: raan % 360,
        ARG_OF_PERICENTER: shell.namePrefix === "DEMO-MOLNIYA" ? 270 : rand() * 360,
        MEAN_ANOMALY: (phase + rand() * 8) % 360,
        EPHEMERIS_TYPE: 0,
        CLASSIFICATION_TYPE: "U",
        NORAD_CAT_ID: String(idCounter++),
        ELEMENT_SET_NO: 999,
        REV_AT_EPOCH: 1,
        BSTAR: 0.000012,
        MEAN_MOTION_DOT: 0.0000001,
        MEAN_MOTION_DDOT: 0,
      });
    }
  }

  return records;
}
