/** Julian Date of J2000.0 epoch */
export const J2000_JD = 2_451_545.0;

/** Convert a JS Date (or ms timestamp) to Julian Date */
export function dateToJd(date: Date | number): number {
  const ms = typeof date === "number" ? date : date.getTime();
  return ms / 86_400_000 + 2_440_587.5;
}

/** Convert Julian Date to JS Date */
export function jdToDate(jd: number): Date {
  return new Date((jd - 2_440_587.5) * 86_400_000);
}

/** Current Julian Date (UTC) */
export function nowJd(): number {
  return dateToJd(Date.now());
}

/** Format a Julian Date as UTC ISO string */
export function jdToIso(jd: number): string {
  return jdToDate(jd).toISOString();
}

/** Clamp sim-time to reasonable bounds (J2000 ± 100 years) */
export function clampJd(jd: number): number {
  return Math.max(J2000_JD - 36525, Math.min(J2000_JD + 36525, jd));
}
