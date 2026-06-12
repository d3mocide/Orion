import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { OMMRecord, OMMGroup } from "@/shared/types/omm";
import type { Transmitter } from "../clients/satnogs";

const DB_NAME = "space-tracking-cache";
const DB_VERSION = 2;
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
const TRANSMITTER_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SpaceTrackingDB extends DBSchema {
  "omm-data": {
    key: string; // group name
    value: { group: string; records: OMMRecord[]; fetchedAt: number };
  };
  "ucs-database": {
    key: string; // "ucs-snapshot"
    value: { key: string; data: unknown; fetchedAt: number };
  };
  transmitters: {
    key: string; // NORAD ID
    value: { noradId: string; transmitters: Transmitter[]; fetchedAt: number };
  };
  metadata: {
    key: string; // source identifier
    value: { key: string; lastFetch: number };
  };
}

type SpaceDB = IDBPDatabase<SpaceTrackingDB>;

let dbPromise: Promise<SpaceDB> | null = null;

function getDB(): Promise<SpaceDB> {
  if (!dbPromise) {
    dbPromise = openDB<SpaceTrackingDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("omm-data")) {
          db.createObjectStore("omm-data", { keyPath: "group" });
        }
        if (!db.objectStoreNames.contains("ucs-database")) {
          db.createObjectStore("ucs-database", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("metadata")) {
          db.createObjectStore("metadata", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("transmitters")) {
          db.createObjectStore("transmitters", { keyPath: "noradId" });
        }
      },
    });
  }
  return dbPromise;
}

/** Read cached OMM records for a group. Returns null if not cached. */
export async function readCachedOMM(group: OMMGroup): Promise<OMMRecord[] | null> {
  const db = await getDB();
  const entry = await db.get("omm-data", group);
  return entry?.records ?? null;
}

/** Write OMM records to cache, updating the fetch timestamp. */
export async function writeCachedOMM(group: OMMGroup, records: OMMRecord[]): Promise<void> {
  const db = await getDB();
  await db.put("omm-data", { group, records, fetchedAt: Date.now() });
  await db.put("metadata", { key: `omm-${group}`, lastFetch: Date.now() });
}

/** Returns true if the cache for a group is older than 2 hours or missing. */
export async function isOMMStale(group: OMMGroup): Promise<boolean> {
  const db = await getDB();
  const meta = await db.get("metadata", `omm-${group}`);
  if (!meta) return true;
  return Date.now() - meta.lastFetch > STALE_THRESHOLD_MS;
}

/** Read last fetch timestamp for a source key. */
export async function getLastFetch(key: string): Promise<number | null> {
  const db = await getDB();
  const meta = await db.get("metadata", key);
  return meta?.lastFetch ?? null;
}

/** Read cached transmitters for a NORAD ID. Returns null if missing or older than 24h. */
export async function readCachedTransmitters(noradId: string): Promise<Transmitter[] | null> {
  const db = await getDB();
  const entry = await db.get("transmitters", noradId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TRANSMITTER_STALE_MS) return null;
  return entry.transmitters;
}

/** Write transmitters for a NORAD ID to cache. */
export async function writeCachedTransmitters(
  noradId: string,
  transmitters: Transmitter[],
): Promise<void> {
  const db = await getDB();
  await db.put("transmitters", { noradId, transmitters, fetchedAt: Date.now() });
}

const UCS_KEY = "ucs-snapshot";

/** Read cached UCS CSV text. Returns null if not cached. */
export async function readCachedUCS(): Promise<string | null> {
  const db = await getDB();
  const entry = await db.get("ucs-database", UCS_KEY);
  if (!entry) return null;
  return entry.data as string;
}

/** Write UCS CSV text to cache. */
export async function writeCachedUCS(csvText: string): Promise<void> {
  const db = await getDB();
  await db.put("ucs-database", { key: UCS_KEY, data: csvText, fetchedAt: Date.now() });
}
