/** NOAA SWPC space weather client — Phase 4 stub. Returns mock data. */

export interface SpaceWeatherSnapshot {
  kpIndex: number;
  solarFluxF107: number;
  timestamp: string;
}

const MOCK_SNAPSHOT: SpaceWeatherSnapshot = {
  kpIndex: 2,
  solarFluxF107: 150,
  timestamp: new Date().toISOString(),
};

export async function fetchSpaceWeather(): Promise<SpaceWeatherSnapshot> {
  // STUB: NOAA SWPC integration not yet implemented
  return MOCK_SNAPSHOT;
}
