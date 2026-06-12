import type { OMMGroup, OMMRecord } from "@/shared/types/omm";
import { fetchOMMGroup, RateLimitError } from "./clients/celestrak";
import { readCachedOMM, writeCachedOMM, isOMMStale } from "./cache/indexeddb";
import { buildDemoCatalog } from "./demo/demoCatalog";

export { RateLimitError };
export type { OMMRecord, OMMGroup };

export interface IngestionResult {
  group: OMMGroup;
  records: OMMRecord[];
  fromCache: boolean;
  /** True when CelesTrak was unreachable and a synthetic demo catalog was substituted */
  demo?: boolean;
}

/**
 * Boot sequence for a single group:
 * 1. Read from IndexedDB → return immediately (paint starts)
 * 2. Check staleness; if stale, revalidate in background
 * 3. On revalidation success, write to DB and call onUpdate
 */
export async function bootstrapGroup(
  group: OMMGroup,
  onUpdate: (result: IngestionResult) => void,
): Promise<IngestionResult> {
  const cached = await readCachedOMM(group);

  if (cached && cached.length > 0) {
    const result: IngestionResult = { group, records: cached, fromCache: true };

    // Kick off background revalidation without blocking
    void revalidateInBackground(group, onUpdate);

    return result;
  }

  // Cold start: must fetch before we can render
  try {
    const records = await fetchOMMGroup(group, { bypassRateLimit: true });
    await writeCachedOMM(group, records);
    return { group, records, fromCache: false };
  } catch (err) {
    // Offline / blocked network: fall back to the synthetic demo constellation
    // (NOT written to cache, so the next online boot fetches real data)
    console.warn(
      `[telemetry-ingestion] CelesTrak unreachable for "${group}", using demo catalog:`,
      err,
    );
    return { group, records: buildDemoCatalog(), fromCache: false, demo: true };
  }
}

async function revalidateInBackground(
  group: OMMGroup,
  onUpdate: (result: IngestionResult) => void,
): Promise<void> {
  try {
    const stale = await isOMMStale(group);
    if (!stale) return;

    const records = await fetchOMMGroup(group, { bypassRateLimit: true });
    await writeCachedOMM(group, records);
    onUpdate({ group, records, fromCache: false });
  } catch (err) {
    if (err instanceof RateLimitError) return; // silently skip
    console.warn(`[telemetry-ingestion] Background revalidation failed for "${group}":`, err);
  }
}
