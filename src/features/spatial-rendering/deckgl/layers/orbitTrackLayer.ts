const R_EARTH_KM = 6_371.0;
const J2000 = 2_451_545.0;

function gmstRad(jdUtc: number): number {
  const deg = 280.46061837 + 360.98564736629 * (jdUtc - J2000);
  return (((deg % 360) + 360) % 360) * (Math.PI / 180);
}

/** ECI (km) + Julian Date → [longitude°, latitude°, altitude m] (WGS84 spherical approx) */
export function eciToWgs84(
  x: number,
  y: number,
  z: number,
  jdUtc: number,
): [number, number, number] {
  const theta = gmstRad(jdUtc);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const xEcef = x * cosT + y * sinT;
  const yEcef = -x * sinT + y * cosT;
  const r = Math.sqrt(xEcef * xEcef + yEcef * yEcef + z * z);
  const lon = Math.atan2(yEcef, xEcef) * (180 / Math.PI);
  const lat = Math.asin(z / r) * (180 / Math.PI);
  const alt = (r - R_EARTH_KM) * 1000; // metres above sphere
  return [lon, lat, alt];
}

export interface TrackSegment {
  source: [number, number, number];
  target: [number, number, number];
}

/**
 * Convert a Float64Array of ECI positions ([x0,y0,z0, x1,y1,z1, ...] km)
 * into deck.gl LineLayer source-target pairs in WGS84.
 */
export function buildOrbitSegments(
  positions: Float64Array,
  jdStart: number,
  stepSec: number,
): TrackSegment[] {
  const count = Math.floor(positions.length / 3);
  const pts: [number, number, number][] = [];

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    if (x === 0 && y === 0 && z === 0) continue;
    pts.push(eciToWgs84(x, y, z, jdStart + (i * stepSec) / 86_400));
  }

  const segments: TrackSegment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    segments.push({ source: pts[i], target: pts[i + 1] });
  }
  return segments;
}
