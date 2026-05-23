/** UCS Satellite Database parser.
 *  CSV format: https://www.ucsusa.org/resources/satellite-database
 *  NORAD Number column is the join key; treated as string to match OMMRecord.NORAD_CAT_ID. */

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

let ucsIndex: Map<string, UCSRecord> = new Map();

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let inQuotes = false;
  let current = "";

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function col(headers: string[], contains: string, excludes?: string): number {
  const lower = contains.toLowerCase();
  const exLower = excludes?.toLowerCase();
  return headers.findIndex((h) => {
    if (!h.includes(lower)) return false;
    if (exLower && h.includes(exLower)) return false;
    return true;
  });
}

function parseNum(val: string | undefined): number | null {
  if (!val) return null;
  const n = parseFloat(val);
  return isFinite(n) ? n : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a UCS Satellite Database CSV string and populate the in-memory index.
 * Returns the number of records loaded.
 */
export function loadUCSData(csvText: string): number {
  // Strip UTF-8 BOM and normalize line endings
  const text = csvText.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return 0;

  const headers = parseCSVRow(lines[0]).map((h) => h.toLowerCase().trim());

  const cols = {
    name: col(headers, "name"),
    country: col(headers, "country of operator"),
    operator: col(headers, "operator/owner", "country"),
    users: col(headers, "users"),
    purpose: col(headers, "purpose", "detailed"),
    perigee: col(headers, "perigee"),
    apogee: col(headers, "apogee"),
    inclination: col(headers, "inclination"),
    period: col(headers, "period"),
    launchMass: col(headers, "launch mass"),
    launchDate: col(headers, "launch date"),
    lifetime: col(headers, "lifetime"),
    norad: col(headers, "norad number"),
  };

  if (cols.norad < 0) {
    console.warn("[UCS] NORAD Number column not found — check CSV format");
    return 0;
  }

  const next = new Map<string, UCSRecord>();

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    const rawNorad = row[cols.norad]?.trim() ?? "";
    if (!/^\d+$/.test(rawNorad)) continue;

    next.set(rawNorad, {
      noradId: rawNorad,
      name: row[cols.name]?.trim() ?? "",
      country: row[cols.country]?.trim() ?? "",
      operator: row[cols.operator]?.trim() ?? "",
      users: row[cols.users]?.trim() ?? "",
      purpose: row[cols.purpose]?.trim() ?? "",
      launchMassKg: parseNum(row[cols.launchMass]),
      expectedLifetimeYears: parseNum(row[cols.lifetime]),
      apogeeKm: parseNum(row[cols.apogee]),
      perigeeKm: parseNum(row[cols.perigee]),
      inclinationDeg: parseNum(row[cols.inclination]),
      periodMin: parseNum(row[cols.period]),
      launchDate: row[cols.launchDate]?.trim() ?? "",
    });
  }

  ucsIndex = next;
  return next.size;
}

export function getUCSRecord(noradId: string): UCSRecord | undefined {
  return ucsIndex.get(noradId);
}

export function getUCSIndex(): ReadonlyMap<string, UCSRecord> {
  return ucsIndex;
}

export function getUniqueOperators(): string[] {
  return [...new Set([...ucsIndex.values()].map((r) => r.operator).filter(Boolean))].sort();
}

export function getUniqueCountries(): string[] {
  return [...new Set([...ucsIndex.values()].map((r) => r.country).filter(Boolean))].sort();
}

export function getUniquePurposes(): string[] {
  return [...new Set([...ucsIndex.values()].map((r) => r.purpose).filter(Boolean))].sort();
}
