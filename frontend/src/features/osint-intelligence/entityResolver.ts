import { getUCSRecord, type UCSRecord } from "./ucs-database";

/** Resolve a NORAD catalog ID to its UCS enrichment record. */
export function resolveEntity(noradId: string): UCSRecord | null {
  return getUCSRecord(noradId) ?? null;
}
