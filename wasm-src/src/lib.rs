use wasm_bindgen::prelude::*;
use sgp4::{Constants, Elements};
use serde::Serialize;

// ── Output types ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct LoadResult {
    pub accepted: u32,
    pub rejected: u32,
}

#[derive(Serialize)]
pub struct SatelliteMetadata {
    pub norad_id: String,
    pub name: String,
    pub object_id: String,
    pub epoch: String,
    pub inclination_deg: f64,
    pub eccentricity: f64,
    pub mean_motion_rev_per_day: f64,
}

// ── Catalog entry ─────────────────────────────────────────────────────────────

struct CatalogEntry {
    /// Opaque string — never parsed as integer (supports 9-digit IDs)
    norad_id: String,
    name: String,
    object_id: String,
    inclination_deg: f64,
    eccentricity: f64,
    mean_motion_rev_per_day: f64,
    epoch_iso: String,
    /// Pre-computed SGP4 constants (the expensive part)
    constants: Constants,
    /// Julian Date of element epoch, for minutes-since-epoch computation
    epoch_jd: f64,
}

// ── Module state ──────────────────────────────────────────────────────────────

thread_local! {
    static CATALOG: std::cell::RefCell<Vec<CatalogEntry>> = std::cell::RefCell::new(Vec::new());
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// chrono::NaiveDateTime → Julian Date
fn naive_dt_to_jd(dt: &chrono::NaiveDateTime) -> f64 {
    // Unix timestamp (seconds since 1970-01-01T00:00:00)
    let unix_sec = dt.and_utc().timestamp() as f64
        + dt.and_utc().timestamp_subsec_nanos() as f64 * 1e-9;
    // JD of Unix epoch = 2440587.5
    unix_sec / 86400.0 + 2_440_587.5
}

/// Julian Date → minutes since element epoch
#[inline]
fn jd_to_minutes_since_epoch(jd_now: f64, epoch_jd: f64) -> f64 {
    (jd_now - epoch_jd) * 1440.0
}

// ── Public WASM API ───────────────────────────────────────────────────────────

/// Load a JSON array of OMM records. Returns { accepted, rejected }.
///
/// Uses the sgp4 crate's serde deserialization directly — OMM JSON field
/// names (`INCLINATION`, `MEAN_MOTION`, etc.) map 1-to-1 to Elements fields.
/// NORAD_CAT_ID is stored as a string; the sgp4 crate parses it to u64
/// internally but we re-encode it as string for all external-facing APIs.
#[wasm_bindgen]
pub fn load_catalog(omm_json: &str) -> JsValue {
    let elements_batch: Vec<Elements> = match serde_json::from_str(omm_json) {
        Ok(v) => v,
        Err(e) => {
            web_sys::console::error_1(&format!("load_catalog parse error: {e}").into());
            return serde_wasm_bindgen::to_value(&LoadResult { accepted: 0, rejected: 0 })
                .unwrap_or(JsValue::NULL);
        }
    };

    let mut accepted = 0u32;
    let mut rejected = 0u32;
    let mut entries: Vec<CatalogEntry> = Vec::with_capacity(elements_batch.len());

    for elements in &elements_batch {
        match Constants::from_elements(elements) {
            Ok(constants) => {
                let epoch_jd = naive_dt_to_jd(&elements.datetime);
                entries.push(CatalogEntry {
                    // Re-encode NORAD ID as string — preserves 9-digit IDs
                    norad_id: elements.norad_id.to_string(),
                    name: elements
                        .object_name
                        .clone()
                        .unwrap_or_else(|| elements.norad_id.to_string()),
                    object_id: elements
                        .international_designator
                        .clone()
                        .unwrap_or_default(),
                    inclination_deg: elements.inclination,
                    eccentricity: elements.eccentricity,
                    mean_motion_rev_per_day: elements.mean_motion,
                    epoch_iso: elements.datetime.to_string(),
                    constants,
                    epoch_jd,
                });
                accepted += 1;
            }
            Err(_) => {
                rejected += 1;
            }
        }
    }

    CATALOG.with(|c| *c.borrow_mut() = entries);

    serde_wasm_bindgen::to_value(&LoadResult { accepted, rejected }).unwrap_or(JsValue::NULL)
}

/// Propagate all catalog objects to `jd_utc`.
///
/// Returns a JS-owned Float64Array: `[x0,y0,z0, x1,y1,z1, ...]` ECI km.
/// Caller should transfer the underlying ArrayBuffer to the main thread (zero-copy).
/// Failed propagations (decayed/invalid orbits) are written as `[0, 0, 0]`.
#[wasm_bindgen]
pub fn propagate_at_jd(jd_utc: f64) -> js_sys::Float64Array {
    CATALOG.with(|catalog| {
        let catalog = catalog.borrow();
        let n = catalog.len();
        let mut buf = vec![0.0f64; n * 3];

        for (i, sat) in catalog.iter().enumerate() {
            let minutes = jd_to_minutes_since_epoch(jd_utc, sat.epoch_jd);
            if let Ok(state) = sat.constants.propagate(sgp4::MinutesSinceEpoch(minutes)) {
                buf[i * 3]     = state.position[0];
                buf[i * 3 + 1] = state.position[1];
                buf[i * 3 + 2] = state.position[2];
            }
            // On error: leave as 0,0,0 — renderer will skip zero-magnitude entries
        }

        // SAFETY: Float64Array::view borrows buf — we copy immediately via slice().
        let view = unsafe { js_sys::Float64Array::view(&buf) };
        js_sys::Float64Array::new(
            &view
                .buffer()
                .slice_with_end(view.byte_offset(), view.byte_offset() + (n as u32) * 3 * 8),
        )
    })
}

/// Propagate a single satellite over a time range.
///
/// Returns Float64Array: `[x0,y0,z0, x1,y1,z1, ...]` ECI km, one entry per step.
/// Returns empty buffer if `norad_id` is not in catalog.
#[wasm_bindgen]
pub fn propagate_range(
    norad_id: &str,
    jd_start: f64,
    jd_end: f64,
    step_sec: f64,
) -> js_sys::Float64Array {
    CATALOG.with(|catalog| {
        let catalog = catalog.borrow();
        let Some(sat) = catalog.iter().find(|s| s.norad_id == norad_id) else {
            return js_sys::Float64Array::new(&js_sys::ArrayBuffer::new(0));
        };

        let num_steps = (((jd_end - jd_start) * 86400.0) / step_sec).floor() as usize + 1;
        let mut buf = vec![0.0f64; num_steps * 3];

        for step in 0..num_steps {
            let jd = jd_start + (step as f64 * step_sec) / 86400.0;
            let minutes = jd_to_minutes_since_epoch(jd, sat.epoch_jd);
            if let Ok(state) = sat.constants.propagate(sgp4::MinutesSinceEpoch(minutes)) {
                buf[step * 3]     = state.position[0];
                buf[step * 3 + 1] = state.position[1];
                buf[step * 3 + 2] = state.position[2];
            }
        }

        let view = unsafe { js_sys::Float64Array::view(&buf) };
        js_sys::Float64Array::new(
            &view
                .buffer()
                .slice_with_end(view.byte_offset(), view.byte_offset() + (num_steps as u32) * 3 * 8),
        )
    })
}

/// Return metadata for one satellite by NORAD ID string. Returns null if not found.
#[wasm_bindgen]
pub fn get_metadata(norad_id: &str) -> JsValue {
    CATALOG.with(|catalog| {
        let catalog = catalog.borrow();
        match catalog.iter().find(|s| s.norad_id == norad_id) {
            Some(sat) => serde_wasm_bindgen::to_value(&SatelliteMetadata {
                norad_id: sat.norad_id.clone(),
                name: sat.name.clone(),
                object_id: sat.object_id.clone(),
                epoch: sat.epoch_iso.clone(),
                inclination_deg: sat.inclination_deg,
                eccentricity: sat.eccentricity,
                mean_motion_rev_per_day: sat.mean_motion_rev_per_day,
            })
            .unwrap_or(JsValue::NULL),
            None => JsValue::NULL,
        }
    })
}

/// Return the number of successfully loaded catalog entries.
#[wasm_bindgen]
pub fn catalog_size() -> u32 {
    CATALOG.with(|c| c.borrow().len() as u32)
}
