import type { OMMRecord, OMMGroup } from "@/shared/types/omm";
import { fetchWithRetry } from "@/shared/utils/fetchRetry";

const CELESTRAK_BASE = "/api/celestrak";
const RATE_LIMIT_MS = 2 * 60 * 60 * 1000; // 2 hours

const lastFetchTime = new Map<OMMGroup, number>();

export class RateLimitError extends Error {
  constructor(group: OMMGroup, msRemaining: number) {
    super(
      `CelesTrak rate limit: group "${group}" was fetched ${Math.round(msRemaining / 60000)} min ago. Next fetch allowed in ${Math.ceil((RATE_LIMIT_MS - msRemaining) / 60000)} min.`,
    );
    this.name = "RateLimitError";
  }
}

export async function fetchOMMGroup(
  group: OMMGroup,
  options: { bypassRateLimit?: boolean } = {},
): Promise<OMMRecord[]> {
  if (!options.bypassRateLimit) {
    const last = lastFetchTime.get(group);
    if (last !== undefined) {
      const elapsed = Date.now() - last;
      if (elapsed < RATE_LIMIT_MS) {
        throw new RateLimitError(group, elapsed);
      }
    }
  }

  const url = `${CELESTRAK_BASE}?GROUP=${encodeURIComponent(group)}&FORMAT=json`;
  const response = await fetchWithRetry(url, {}, { maxAttempts: 3, timeout: 60_000 });

  if (!response.ok) {
    throw new Error(`CelesTrak fetch failed: HTTP ${response.status} for group "${group}"`);
  }

  const raw: unknown = await response.json();
  const records = parseOMMResponse(raw, group);
  lastFetchTime.set(group, Date.now());
  return records;
}

function parseOMMResponse(raw: unknown, group: OMMGroup): OMMRecord[] {
  if (!Array.isArray(raw)) {
    throw new Error(`CelesTrak: expected JSON array for group "${group}", got ${typeof raw}`);
  }

  return raw.map((item: unknown, idx) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`CelesTrak: record ${idx} is not an object`);
    }
    return validateOMMRecord(item as Record<string, unknown>, idx);
  });
}

function requireString(obj: Record<string, unknown>, key: string, idx: number): string {
  const val = obj[key];
  if (typeof val !== "string" && typeof val !== "number") {
    throw new Error(`CelesTrak record ${idx}: missing required field "${key}"`);
  }
  // NORAD_CAT_ID must always be returned as string — never number
  return String(val);
}

function requireNumber(obj: Record<string, unknown>, key: string, idx: number): number {
  const val = obj[key];
  const n = Number(val);
  if (!isFinite(n)) {
    throw new Error(
      `CelesTrak record ${idx}: field "${key}" is not a finite number (got ${String(val)})`,
    );
  }
  return n;
}

function validateOMMRecord(obj: Record<string, unknown>, idx: number): OMMRecord {
  return {
    OBJECT_NAME: requireString(obj, "OBJECT_NAME", idx),
    OBJECT_ID: requireString(obj, "OBJECT_ID", idx),
    EPOCH: requireString(obj, "EPOCH", idx),
    MEAN_MOTION: requireNumber(obj, "MEAN_MOTION", idx),
    ECCENTRICITY: requireNumber(obj, "ECCENTRICITY", idx),
    INCLINATION: requireNumber(obj, "INCLINATION", idx),
    RA_OF_ASC_NODE: requireNumber(obj, "RA_OF_ASC_NODE", idx),
    ARG_OF_PERICENTER: requireNumber(obj, "ARG_OF_PERICENTER", idx),
    MEAN_ANOMALY: requireNumber(obj, "MEAN_ANOMALY", idx),
    EPHEMERIS_TYPE: requireNumber(obj, "EPHEMERIS_TYPE", idx),
    CLASSIFICATION_TYPE: requireString(obj, "CLASSIFICATION_TYPE", idx),
    // CRITICAL: NORAD_CAT_ID is always treated as a string — never as a fixed-width integer
    NORAD_CAT_ID: requireString(obj, "NORAD_CAT_ID", idx),
    ELEMENT_SET_NO: requireNumber(obj, "ELEMENT_SET_NO", idx),
    REV_AT_EPOCH: requireNumber(obj, "REV_AT_EPOCH", idx),
    BSTAR: requireNumber(obj, "BSTAR", idx),
    MEAN_MOTION_DOT: requireNumber(obj, "MEAN_MOTION_DOT", idx),
    MEAN_MOTION_DDOT: requireNumber(obj, "MEAN_MOTION_DDOT", idx),
  };
}
