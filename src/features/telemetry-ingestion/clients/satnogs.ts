/**
 * SatNOGS DB client — transmitter (frequency/mode) records per satellite.
 *
 * The SatNOGS DB API is public, CORS-enabled, and keyed by NORAD catalog
 * number. Results are cached in IndexedDB for 24 h; failures degrade to an
 * empty list so the detail panel can render a "no RF data" state.
 */

import { fetchWithRetry } from "@/shared/utils/fetchRetry";
import { readCachedTransmitters, writeCachedTransmitters } from "../cache/indexeddb";

const SATNOGS_BASE = "https://db.satnogs.org/api/transmitters/";

export interface Transmitter {
  uuid: string;
  description: string;
  alive: boolean;
  type: string; // "Transmitter" | "Transceiver" | "Transponder"
  status: string; // "active" | "inactive" | "invalid"
  uplinkLowHz: number | null;
  uplinkHighHz: number | null;
  downlinkLowHz: number | null;
  downlinkHighHz: number | null;
  mode: string | null;
  baud: number | null;
  invert: boolean;
}

interface RawTransmitter {
  uuid?: string;
  description?: string;
  alive?: boolean;
  type?: string;
  status?: string;
  uplink_low?: number | null;
  uplink_high?: number | null;
  downlink_low?: number | null;
  downlink_high?: number | null;
  mode?: string | null;
  baud?: number | null;
  invert?: boolean;
}

function parseTransmitter(raw: RawTransmitter): Transmitter {
  return {
    uuid: raw.uuid ?? "",
    description: raw.description ?? "",
    alive: raw.alive ?? false,
    type: raw.type ?? "Transmitter",
    status: raw.status ?? "unknown",
    uplinkLowHz: raw.uplink_low ?? null,
    uplinkHighHz: raw.uplink_high ?? null,
    downlinkLowHz: raw.downlink_low ?? null,
    downlinkHighHz: raw.downlink_high ?? null,
    mode: raw.mode ?? null,
    baud: raw.baud ?? null,
    invert: raw.invert ?? false,
  };
}

/**
 * Fetch transmitters for a NORAD ID with a 24h IndexedDB cache.
 * Returns [] on any failure (offline, CORS, API down).
 */
export async function fetchTransmitters(noradId: string): Promise<Transmitter[]> {
  const cached = await readCachedTransmitters(noradId);
  if (cached) return cached;

  try {
    const url = `${SATNOGS_BASE}?satellite__norad_cat_id=${encodeURIComponent(noradId)}&format=json`;
    const response = await fetchWithRetry(url, {}, { maxAttempts: 2, timeout: 15_000 });
    if (!response.ok) return [];

    const raw: unknown = await response.json();
    if (!Array.isArray(raw)) return [];

    const transmitters = (raw as RawTransmitter[]).map(parseTransmitter);
    await writeCachedTransmitters(noradId, transmitters);
    return transmitters;
  } catch {
    return [];
  }
}

/** Format a frequency in Hz for display, e.g. 145.800 MHz / 10.45 GHz. */
export function formatFrequency(hz: number | null): string {
  if (hz === null || !isFinite(hz) || hz <= 0) return "—";
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(3)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(3)} MHz`;
  return `${(hz / 1e3).toFixed(1)} kHz`;
}
