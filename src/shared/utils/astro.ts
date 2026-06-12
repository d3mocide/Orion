/**
 * Astronomy utilities shared by the Three.js renderer and the pass-prediction
 * engine. All positions are geocentric kilometers unless noted.
 *
 * Frames:
 *  - ECI  — inertial equatorial frame (SGP4/TEME output; GMST-referenced)
 *  - ECEF — Earth-fixed frame (rotates with the planet)
 *
 * Accuracy targets are visual/amateur-radio grade: GMST per ARCHITECTURE.md C5,
 * low-precision solar ephemeris (~0.01°), truncated lunar ephemeris (~0.5°).
 */

import { J2000_JD } from "./time";

export const R_EARTH_KM = 6371.0;
export const WGS84_A_KM = 6378.137;
export const WGS84_F = 1 / 298.257223563;
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);
export const AU_KM = 149_597_870.7;

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Greenwich Mean Sidereal Time in radians, normalized to [0, 2π). (C5) */
export function gmstRad(jdUtc: number): number {
  const thetaDeg = 280.46061837 + 360.98564736629 * (jdUtc - J2000_JD);
  const wrapped = thetaDeg % 360;
  return ((wrapped < 0 ? wrapped + 360 : wrapped) * DEG) % TWO_PI;
}

/** Rotate an ECI position into ECEF using GMST. */
export function eciToEcef(eci: Vec3, jdUtc: number): Vec3 {
  const theta = gmstRad(jdUtc);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    x: eci.x * c + eci.y * s,
    y: -eci.x * s + eci.y * c,
    z: eci.z,
  };
}

/** Rotate an ECEF position into ECI using GMST. */
export function ecefToEci(ecef: Vec3, jdUtc: number): Vec3 {
  const theta = gmstRad(jdUtc);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    x: ecef.x * c - ecef.y * s,
    y: ecef.x * s + ecef.y * c,
    z: ecef.z,
  };
}

export interface GeodeticLocation {
  /** Latitude in degrees, north positive */
  latDeg: number;
  /** Longitude in degrees, east positive */
  lonDeg: number;
  /** Height above the WGS84 ellipsoid in km */
  altKm: number;
}

/** Geodetic latitude/longitude/height → ECEF position (WGS84 ellipsoid). */
export function geodeticToEcef(loc: GeodeticLocation): Vec3 {
  const lat = loc.latDeg * DEG;
  const lon = loc.lonDeg * DEG;
  const sinLat = Math.sin(lat);
  const n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  return {
    x: (n + loc.altKm) * Math.cos(lat) * Math.cos(lon),
    y: (n + loc.altKm) * Math.cos(lat) * Math.sin(lon),
    z: (n * (1 - WGS84_E2) + loc.altKm) * sinLat,
  };
}

export interface LookAngles {
  /** Azimuth in degrees, 0=N 90=E, [0, 360) */
  azDeg: number;
  /** Elevation above local horizon in degrees */
  elDeg: number;
  /** Slant range in km */
  rangeKm: number;
}

/**
 * Topocentric look angles from an observer to a satellite.
 * Satellite position is ECI; observer is geodetic. Time fixes the GMST rotation.
 */
export function lookAnglesFromEci(
  satEci: Vec3,
  observer: GeodeticLocation,
  jdUtc: number,
): LookAngles {
  const satEcef = eciToEcef(satEci, jdUtc);
  const obsEcef = geodeticToEcef(observer);

  const dx = satEcef.x - obsEcef.x;
  const dy = satEcef.y - obsEcef.y;
  const dz = satEcef.z - obsEcef.z;

  const lat = observer.latDeg * DEG;
  const lon = observer.lonDeg * DEG;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  // ECEF delta → local East-North-Up
  const e = -sinLon * dx + cosLon * dy;
  const n = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
  const u = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

  const rangeKm = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const azRad = Math.atan2(e, n);
  return {
    azDeg: (((azRad / DEG) % 360) + 360) % 360,
    elDeg: Math.asin(u / rangeKm) / DEG,
    rangeKm,
  };
}

/**
 * Geocentric solar position in the ECI equatorial frame (km).
 * Low-precision formula (Astronomical Almanac), good to ~0.01° — more than
 * enough to light the globe and place the terminator.
 */
export function sunEci(jdUtc: number): Vec3 {
  const n = jdUtc - J2000_JD;
  const meanLon = (280.46 + 0.9856474 * n) % 360;
  const meanAnom = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const eclLon = (meanLon + 1.915 * Math.sin(meanAnom) + 0.02 * Math.sin(2 * meanAnom)) * DEG;
  const obliquity = (23.439 - 4e-7 * n) * DEG;
  const distKm =
    (1.00014 - 0.01671 * Math.cos(meanAnom) - 0.00014 * Math.cos(2 * meanAnom)) * AU_KM;
  return {
    x: distKm * Math.cos(eclLon),
    y: distKm * Math.cos(obliquity) * Math.sin(eclLon),
    z: distKm * Math.sin(obliquity) * Math.sin(eclLon),
  };
}

/**
 * Geocentric lunar position in the ECI equatorial frame (km).
 * Truncated Meeus series (~0.5° / ~1000 km) — visual placement only.
 */
export function moonEci(jdUtc: number): Vec3 {
  const n = jdUtc - J2000_JD;
  const meanLon = (218.316 + 13.176396 * n) * DEG; // mean longitude
  const meanAnom = (134.963 + 13.064993 * n) * DEG; // mean anomaly
  const meanDist = (93.272 + 13.22935 * n) * DEG; // mean distance (arg. of latitude)

  const eclLon = meanLon + 6.289 * DEG * Math.sin(meanAnom);
  const eclLat = 5.128 * DEG * Math.sin(meanDist);
  const distKm = 385_001 - 20_905 * Math.cos(meanAnom);

  const obliquity = (23.439 - 4e-7 * n) * DEG;
  const cosLat = Math.cos(eclLat);
  // Ecliptic → equatorial rotation about the x-axis
  const xEcl = distKm * cosLat * Math.cos(eclLon);
  const yEcl = distKm * cosLat * Math.sin(eclLon);
  const zEcl = distKm * Math.sin(eclLat);
  return {
    x: xEcl,
    y: yEcl * Math.cos(obliquity) - zEcl * Math.sin(obliquity),
    z: yEcl * Math.sin(obliquity) + zEcl * Math.cos(obliquity),
  };
}
