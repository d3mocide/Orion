import { describe, it, expect } from "vitest";
import {
  gmstRad,
  eciToEcef,
  ecefToEci,
  geodeticToEcef,
  lookAnglesFromEci,
  sunEci,
  moonEci,
  WGS84_A_KM,
} from "../astro";
import { dateToJd, J2000_JD } from "../time";

const DEG = Math.PI / 180;

describe("gmstRad", () => {
  it("matches the reference value at the J2000 epoch", () => {
    // θ(J2000) = 280.46061837°
    expect(gmstRad(J2000_JD)).toBeCloseTo(280.46061837 * DEG, 8);
  });

  it("advances ~360.9856° per day (sidereal rate)", () => {
    const a = gmstRad(J2000_JD);
    const b = gmstRad(J2000_JD + 1);
    const advanceDeg = ((((b - a) / DEG) % 360) + 360) % 360;
    expect(advanceDeg).toBeCloseTo(0.98564736629, 6);
  });
});

describe("ECI ↔ ECEF", () => {
  it("round-trips a position", () => {
    const jd = 2460000.25;
    const eci = { x: 5000, y: -3000, z: 4000 };
    const back = ecefToEci(eciToEcef(eci, jd), jd);
    expect(back.x).toBeCloseTo(eci.x, 9);
    expect(back.y).toBeCloseTo(eci.y, 9);
    expect(back.z).toBeCloseTo(eci.z, 9);
  });

  it("preserves the z component", () => {
    const ecef = eciToEcef({ x: 1, y: 2, z: 3 }, 2460000);
    expect(ecef.z).toBe(3);
  });
});

describe("geodeticToEcef", () => {
  it("puts (0°, 0°) on the equator at +X", () => {
    const p = geodeticToEcef({ latDeg: 0, lonDeg: 0, altKm: 0 });
    expect(p.x).toBeCloseTo(WGS84_A_KM, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  it("puts the north pole at +Z with the polar radius", () => {
    const p = geodeticToEcef({ latDeg: 90, lonDeg: 0, altKm: 0 });
    expect(p.x).toBeCloseTo(0, 6);
    // b = a(1 − f) ≈ 6356.7523 km
    expect(p.z).toBeCloseTo(6356.7523142, 3);
  });
});

describe("lookAnglesFromEci", () => {
  it("reports el = 90° for a satellite directly overhead", () => {
    const jd = 2460500.123;
    const theta = gmstRad(jd);
    // Observer at (0°, 0°): zenith is along ECEF +X. Build the matching ECI position.
    const r = WGS84_A_KM + 800;
    const satEci = { x: r * Math.cos(theta), y: r * Math.sin(theta), z: 0 };
    const look = lookAnglesFromEci(satEci, { latDeg: 0, lonDeg: 0, altKm: 0 }, jd);
    expect(look.elDeg).toBeCloseTo(90, 3);
    expect(look.rangeKm).toBeCloseTo(800, 1);
  });

  it("reports negative elevation for a satellite on the far side of Earth", () => {
    const jd = 2460500.5;
    const theta = gmstRad(jd);
    const r = WGS84_A_KM + 800;
    const satEci = { x: -r * Math.cos(theta), y: -r * Math.sin(theta), z: 0 };
    const look = lookAnglesFromEci(satEci, { latDeg: 0, lonDeg: 0, altKm: 0 }, jd);
    expect(look.elDeg).toBeLessThan(0);
  });

  it("points north (az≈0) for a satellite north of the observer", () => {
    const jd = 2460500.7;
    const theta = gmstRad(jd);
    // Observer at equator; satellite over 30°N on the same meridian (geocentric sphere)
    const r = WGS84_A_KM + 1000;
    const lat = 30 * DEG;
    const ecef = { x: r * Math.cos(lat), y: 0, z: r * Math.sin(lat) };
    const satEci = ecefToEci(ecef, jd);
    void theta;
    const look = lookAnglesFromEci(satEci, { latDeg: 0, lonDeg: 0, altKm: 0 }, jd);
    expect(Math.min(look.azDeg, 360 - look.azDeg)).toBeLessThan(1);
  });
});

describe("sunEci", () => {
  it("has positive declination at the June solstice", () => {
    const jd = dateToJd(Date.UTC(2026, 5, 21, 12));
    const s = sunEci(jd);
    const r = Math.hypot(s.x, s.y, s.z);
    const declDeg = (Math.asin(s.z / r) * 180) / Math.PI;
    expect(declDeg).toBeGreaterThan(23.0);
    expect(declDeg).toBeLessThan(23.8);
    // ~1 AU
    expect(r).toBeGreaterThan(1.4e8);
    expect(r).toBeLessThan(1.6e8);
  });

  it("has near-zero declination at the equinox", () => {
    const jd = dateToJd(Date.UTC(2026, 2, 20, 12));
    const s = sunEci(jd);
    const r = Math.hypot(s.x, s.y, s.z);
    const declDeg = (Math.asin(s.z / r) * 180) / Math.PI;
    expect(Math.abs(declDeg)).toBeLessThan(1);
  });
});

describe("moonEci", () => {
  it("stays within the real lunar distance envelope", () => {
    for (let i = 0; i < 30; i++) {
      const m = moonEci(J2000_JD + i * 1.37);
      const r = Math.hypot(m.x, m.y, m.z);
      expect(r).toBeGreaterThan(350_000);
      expect(r).toBeLessThan(410_000);
    }
  });
});
