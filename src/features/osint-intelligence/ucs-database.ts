/** UCS Satellite Database parser — Phase 4 implementation.
 *  Phase 1 stub: types and empty index. */

export interface UCSRecord {
  noradId: string;
  name: string;
  country: string;
  operator: string;
  purpose: string;
  users: string;
  launchMassKg: number | null;
  expectedLifetimeYears: number | null;
  apogeeKm: number | null;
  perigeeKm: number | null;
  inclinationDeg: number | null;
  periodMin: number | null;
  launchDate: string;
}

/** In-memory index keyed by NORAD ID string */
let ucsIndex: Map<string, UCSRecord> = new Map();

export function getUCSRecord(noradId: string): UCSRecord | undefined {
  return ucsIndex.get(noradId);
}

export function getUCSIndex(): ReadonlyMap<string, UCSRecord> {
  return ucsIndex;
}

export function loadUCSData(_csvText: string): void {
  // Phase 4: parse CSV and populate ucsIndex
  ucsIndex = new Map();
}

export function getUniqueOperators(): string[] {
  return [...new Set([...ucsIndex.values()].map((r) => r.operator))].sort();
}

export function getUniqueCountries(): string[] {
  return [...new Set([...ucsIndex.values()].map((r) => r.country))].sort();
}

export function getUniquePurposes(): string[] {
  return [...new Set([...ucsIndex.values()].map((r) => r.purpose))].sort();
}
