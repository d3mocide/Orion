/** SatNOGS RF telemetry client — Phase 4 stub. Returns mock data. */

export interface SatNOGSTelemetry {
  noradId: string;
  timestamp: string;
  frame: string;
}

export async function fetchSatNOGSTelemetry(_noradId: string): Promise<SatNOGSTelemetry[]> {
  // STUB: SatNOGS integration not yet implemented
  return [];
}
