# Architecture & Technical Decisions

This document records the key design decisions in Orion, the rationale behind each, and the constraints they impose on future development. Violating these decisions typically results in correctness bugs, frame-rate regressions, or memory bloat at 10k-object scale.

---

## C1 — OMM JSON over TLE

**Decision:** All satellite data is ingested as CelesTrak OMM (Orbit Mean-Elements Message) JSON. No TLE parser exists or will be added.

**Rationale:**

- OMM is the CCSDS standard for mean orbital elements. CelesTrak natively exports OMM JSON at the same endpoint that formerly served TLE; no custom line-oriented parser is required.
- TLE NORAD catalog numbers are 5-digit integers (max 99,999). The catalog is projected to exhaust that namespace in **July 2026**. CelesTrak's OMM JSON already uses 9-digit NORAD IDs (`NORAD_CAT_ID` field) in preparation. A TLE parser built today would be invalid in under a year.
- The Rust `sgp4` crate accepts `sgp4::Elements` deserialized directly from OMM JSON fields via `serde`. No intermediate string-parsing step is needed.
- OMM fields map 1-to-1 with SGP4 `Elements` struct fields; TLE requires character-position extraction and checksum validation.

**Constraint:** Do not add a TLE ingestion path. If a source only provides TLE, convert it to OMM JSON using the CelesTrak conversion API before storage.

---

## C2 — PointPrimitiveCollection over Entity API

**Decision:** All satellite objects are rendered as `PointPrimitive` instances inside a single `PointPrimitiveCollection`. The Cesium Entity API is never used.

**Rationale:**

Cesium's Entity API is designed for interactive scenes with a small number of objects. At 10k objects it has two fatal performance characteristics:

1. **Per-read cloning:** `entity.position.getValue()` returns a new `Cartesian3` on every call — 600,000 allocations/second at 10k × 60 FPS, saturating the GC.
2. **CallbackProperty overhead:** Anything updated per-frame must use `CallbackProperty`, which is invoked inside Cesium's property system on every frame for every entity.

`PointPrimitive.position` accepts a `Cartesian3` written in-place using a single scratch instance. **Zero per-frame heap allocations.** The entire collection is batched into one GPU draw call.

**Constraint:** Do not use `viewer.entities`, `Entity`, `EntityCollection`, or `CallbackProperty`. Orbit tracks use the deck.gl overlay, not Cesium `Polyline`.

---

## C3 — Rust/WASM SGP4 over a JS Implementation

**Decision:** SGP4 propagation runs inside a Rust WebAssembly module compiled from `wasm-src/` using the `sgp4` crate.

**Rationale:**

- Pure-JavaScript SGP4 implementations run 3–5× slower than the Rust WASM equivalent at 10k objects. The 16ms frame budget cannot be met in JS.
- The Rust `sgp4` crate is formally verified against the reference implementation test vectors.
- Running propagation in a Web Worker keeps the main thread free for Cesium rendering.
- WASM linear memory allows batch processing: all positions are written into a pre-allocated `Float64Array` buffer without intermediate JS objects.

**Build:**
```bash
wasm-pack build wasm-src --target web \
  --out-dir src/features/orbital-mechanics/wasm \
  --no-pack
```

**Constraint:** SGP4 must not be called on the main thread. All propagation goes through the Comlink worker interface.

---

## C4 — Comlink + Transferable ArrayBuffer

**Decision:** The WASM worker is wrapped with Comlink for type-safe RPC. Propagation results are returned as a `Float64Array` whose `ArrayBuffer` is transferred (not copied) to the main thread.

**Rationale:**

- `postMessage` with a plain object or `JSON.stringify` would serialize 10k × 3 Float64 coordinates = 240 kB as UTF-8 on every frame: ~14 MB/s of encoding overhead at 60 FPS.
- `ArrayBuffer` transfer via the `Transferable` mechanism moves ownership in O(1). The buffer is immediately available on the main thread as a `Float64Array` view with zero copy.
- Comlink wraps worker functions in a `Proxy` returning `Promise`-based RPC calls, providing TypeScript type safety with no manual `onmessage`/`postMessage` dispatch.

**Pattern:**
```typescript
// Worker side
async propagateAt(jdUtc: number): Promise<ArrayBuffer> {
  const positions = wasm.propagate_at_jd(jdUtc);
  return positions.slice().buffer; // slice() copies out of WASM memory; .buffer is Transferable
}
```

**Constraint:** Never `JSON.stringify` propagation results. The `.slice().buffer` pattern is intentional — the original `Float64Array` view borrows from WASM linear memory and must not be transferred directly.

---

## C5 — ECI→ECEF Rotation via GMST

**Decision:** Satellite positions from SGP4 (ECI frame) are rotated to ECEF in the main-thread render loop using Greenwich Mean Sidereal Time (GMST).

**Formula:**
```
θ_GMST [deg] = 280.46061837 + 360.98564736629 × (JD − 2451545.0)

x_ECEF =  x_ECI · cos(θ) + y_ECI · sin(θ)
y_ECEF = −x_ECI · sin(θ) + y_ECI · cos(θ)
z_ECEF =  z_ECI
```

**Rationale:**

- SGP4 outputs ECI positions. CesiumJS `Cartesian3` expects ECEF. Direct assignment of ECI coordinates produces a slowly rotating positional error (up to 400 km at mid-latitudes).
- The IAU2006 precession-nutation correction adds < 100 m at visual display scales. GMST is sufficient.
- GMST is computed **once per frame** (two trig calls), not per satellite, so cost is O(1) regardless of catalog size.

---

## C6 — Zustand Outside the React rAF Loop

**Decision:** The render loop reads simulation state (`simSpeed`, `simPaused`) from Zustand via `getState()` — not via React hooks or subscriptions.

**Rationale:**

- React state subscriptions trigger re-renders. A re-render of the Cesium parent component would destroy and recreate the `PointPrimitiveCollection`, resetting GPU state.
- `requestAnimationFrame` callbacks run outside React's scheduler. Using hooks inside `rAF` violates the Rules of Hooks.
- `zustandStore.getState()` is a synchronous, zero-subscription snapshot read. The rAF loop calls it each frame without ever registering a listener.

**Pattern:**
```typescript
// Inside rAF callback — no hooks, no subscriptions
const { simSpeed, simPaused } = useUIStore.getState();
if (!simPaused) simJd += (wallDelta * simSpeed) / 86400;
```

---

## C7 — deck.gl GlobeView for Orbit Track

**Decision:** Selected-satellite orbit tracks are rendered as deck.gl `LineLayer` instances using `GlobeView`, composited as a transparent canvas overlay on the Cesium canvas.

**Rationale:**

- Cesium `PolylineCollection` submits a separate draw call per polyline. deck.gl `LineLayer` batches all segments into one instanced draw call.
- `GlobeView` uses a WGS-84 sphere coordinate system compatible with ECI→ECEF positions computed for Cesium.
- The transparent canvas overlay pattern (two stacked `<canvas>` elements) keeps Cesium's internal WebGL context unmodified.

**Camera sync:** Each frame the render loop calls `overlay.syncCamera(viewer.camera)`, converting Cesium's geodetic camera position and heading/pitch to deck.gl `GlobeView` viewState. Synchronization is approximate (sufficient for visual track alignment).

---

## C8 — IndexedDB Stale-While-Revalidate

**Decision:** OMM JSON from CelesTrak is cached in IndexedDB via the `idb` library with a 2-hour staleness window using a stale-while-revalidate strategy.

**Rationale:**

- CelesTrak rate-limits clients to one catalog fetch per 2 hours. Fetching on every page load would exhaust the quota.
- IndexedDB resolves in < 5 ms for 10k records; network fetch takes 1–3 seconds. Serving stale data immediately eliminates blank-globe FOUC.
- Background revalidation fetches new data after the page is interactive, writes to IndexedDB, and updates in-memory state without a reload.

**SWR flow:**
```
1. Read IndexedDB → resolve immediately (even if stale)
2. If age > 2h → background fetch from CelesTrak
3. On fetch success → write IndexedDB + update render loop
4. On fetch failure → keep serving stale data
```

---

## Directory Layout

The project uses a **feature-driven** layout. Each feature owns its types, components, workers, and tests:

```
src/features/<feature>/
  index.ts        # Public API surface (re-exports only)
  *.ts / *.tsx    # Implementation
  __tests__/      # Co-located unit tests
```

`src/shared/` holds only things with no feature affiliation: Zustand stores, shared TypeScript interfaces, and time utilities. There are no top-level `components/`, `hooks/`, or `services/` directories.
