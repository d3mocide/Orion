/** OMM JSON record as returned by CelesTrak GP endpoint (FORMAT=json).
 *  NORAD_CAT_ID is intentionally a string — NEVER parse as fixed-width integer.
 *  See §2 C1: supports 9-digit IDs ahead of July 2026 catalog exhaustion. */
export interface OMMRecord {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  EPHEMERIS_TYPE: number;
  CLASSIFICATION_TYPE: string;
  /** Treat as opaque string — do not parse to integer */
  NORAD_CAT_ID: string;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
}

export interface OMMCacheEntry {
  group: string;
  records: OMMRecord[];
  fetchedAt: number;
}

export type OMMGroup =
  | "active"
  | "starlink"
  | "oneweb"
  | "gps-ops"
  | "geo"
  | "iridium-NEXT"
  | "last-30-days";
