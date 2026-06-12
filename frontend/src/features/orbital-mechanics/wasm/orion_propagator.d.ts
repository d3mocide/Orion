/* tslint:disable */
/* eslint-disable */

/**
 * Return the number of successfully loaded catalog entries.
 */
export function catalog_size(): number;

/**
 * Return metadata for one satellite by NORAD ID string. Returns null if not found.
 */
export function get_metadata(norad_id: string): any;

/**
 * Load a JSON array of OMM records. Returns { accepted, rejected }.
 *
 * Uses the sgp4 crate's serde deserialization directly — OMM JSON field
 * names (`INCLINATION`, `MEAN_MOTION`, etc.) map 1-to-1 to Elements fields.
 * NORAD_CAT_ID is stored as a string; the sgp4 crate parses it to u64
 * internally but we re-encode it as string for all external-facing APIs.
 */
export function load_catalog(omm_json: string): any;

/**
 * Propagate all catalog objects to `jd_utc`.
 *
 * Returns a JS-owned Float64Array: `[x0,y0,z0, x1,y1,z1, ...]` ECI km.
 * Caller should transfer the underlying ArrayBuffer to the main thread (zero-copy).
 * Failed propagations (decayed/invalid orbits) are written as `[0, 0, 0]`.
 */
export function propagate_at_jd(jd_utc: number): Float64Array;

/**
 * Propagate a single satellite over a time range.
 *
 * Returns Float64Array: `[x0,y0,z0, x1,y1,z1, ...]` ECI km, one entry per step.
 * Returns empty buffer if `norad_id` is not in catalog.
 */
export function propagate_range(norad_id: string, jd_start: number, jd_end: number, step_sec: number): Float64Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly catalog_size: () => number;
    readonly get_metadata: (a: number, b: number) => any;
    readonly load_catalog: (a: number, b: number) => any;
    readonly propagate_at_jd: (a: number) => any;
    readonly propagate_range: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
