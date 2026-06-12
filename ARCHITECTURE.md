# Architecture & Technical Decisions

This document records the key design decisions in Orion, the rationale behind each, and the constraints they impose. Violating these decisions typically results in correctness bugs, frame-rate regressions, or memory bloat at 10k-object scale.

---

## C1 — OMM JSON over TLE

**Decision:** All satellite data is ingested as CelesTrak OMM (Orbit Mean-Elements Message) JSON. No TLE parser exists or will be added.

**Rationale:**

- OMM is the CCSDS standard for mean orbital elements. CelesTrak natively exports OMM JSON at the same endpoint that formerly served TLE.
- TLE NORAD catalog numbers are 5-digit integers (max 99,999); the catalog is projected to exhaust that namespace. CelesTrak's OMM JSON already uses 9-digit NORAD IDs. `NORAD_CAT_ID` is treated as an **opaque string** everywhere.
- The Rust `sgp4` crate deserializes `sgp4::Elements` directly from OMM JSON fields via `serde` — no intermediate parsing.

**Constraint:** Do not add a TLE ingestion path. If a source only provides TLE, convert it to OMM JSON before storage.

---

## C2 — One `THREE.Points` Draw Call for the Catalog

**Decision:** The entire satellite cloud is a single `THREE.Points` object with a custom `ShaderMaterial`. Per-satellite scene-graph nodes are never created.

**Rationale:**

- 10k `Object3D` instances would mean 10k matrix updates and draw calls per frame. One `Points` geometry batches everything into a single instanced draw.
- Visibility filtering writes a per-vertex `aVisible` attribute (hidden points get `gl_PointSize = 0`) — toggling filters is an O(n) typed-array write with no geometry rebuild and no GPU reallocation.
- Per-vertex `aColor` encodes orbit regime; the fragment shader renders a soft-glow disc that feeds the bloom pass.
- Picking is screen-space: project visible points on (debounced) pointer events and select the nearest within a pixel threshold. O(n) per *event*, never per frame.

**Constraint:** Do not add per-satellite meshes/sprites. Selection/hover affordances are separate singleton objects (one marker sprite, one track line), not per-satellite children.

---

## C3 — Rust/WASM SGP4 over a JS Implementation

**Decision:** SGP4 propagation runs inside a Rust WebAssembly module compiled from `wasm-src/` using the `sgp4` crate, inside a Web Worker.

**Rationale:**

- Pure-JS SGP4 runs 3–5× slower at 10k objects; the frame budget cannot absorb it.
- The Rust `sgp4` crate is verified against the reference test vectors.
- The worker keeps the main thread free for rendering; WASM linear memory allows batch output into a single `Float64Array`.

**Build:**
```bash
wasm-pack build wasm-src --target web \
  --out-dir ../src/features/orbital-mechanics/wasm --no-pack
```

**Constraints:**
- SGP4 must not be called on the main thread. All propagation goes through the Comlink worker interface.
- WASM functions must return JS-owned arrays via the **safe copy** `js_sys::Float64Array::from(&buf[..])`. The `view()`+`buffer().slice()` pattern is forbidden: it throws on zero-length buffers, and a JS exception thrown mid-`RefCell` borrow skips Rust destructors, permanently poisoning the catalog (`BorrowError` on every later call).

---

## C4 — Comlink + Transferable ArrayBuffer

**Decision:** The WASM worker is wrapped with Comlink. Propagation results cross threads as `Float64Array` buffers, never as JSON.

**Rationale:**

- JSON-serializing 10k×3 floats per tick would cost ~14 MB/s of encoding overhead.
- `ArrayBuffer` transfer moves ownership in O(1); Comlink provides typed RPC without manual `postMessage` dispatch.

**Constraints:**
- Never `JSON.stringify` propagation results.
- A Comlink proxy is **function-typed**. Storing one in React state requires the updater form — `setPropagator(() => api)` — otherwise React invokes the proxy as a state-updater function and stores a garbage promise. (This exact bug shipped once.)

---

## C5 — ECI World Frame; the Earth Rotates Instead

**Decision:** The Three.js world frame is z-up ECI, scaled 1 unit = 1000 km. SGP4 output is copied into the GPU position buffer **unmodified**. The Earth/clouds/ground-station group rotates by GMST (`group.rotation.z = θ_GMST`); satellites, stars, sun, and moon are never rotated.

```
θ_GMST [deg] = 280.46061837 + 360.98564736629 × (JD − 2451545.0)
```

**Rationale:**

- The previous design rotated every satellite ECI→ECEF per frame (10k×2 trig + 4 mul). Rotating the one object that is actually Earth-fixed — the Earth — costs a single rotation and is *more* correct: stars genuinely don't rotate with Earth, and orbit tracks are clean closed curves in ECI.
- GMST precision (vs. full IAU2006) errs < 100 m at visual scales.
- Anything tied to the ground (observer marker, future ground tracks) is parented inside the Earth group and positioned in plain ECEF.

**Constraint:** Never write ECEF coordinates into the satellite position buffer. Ground-fixed objects go inside the Earth group; free-flying objects go in the scene root in ECI.

---

## C6 — Zustand Outside the React rAF Loop

**Decision:** The render loop reads simulation state (`simSpeed`, `simPaused`) from Zustand via `getState()` — not via React hooks or subscriptions.

**Rationale:**

- React subscriptions trigger re-renders; a re-render of the scene's parent would tear down the WebGL context.
- `getState()` is a synchronous, zero-subscription snapshot read, safe inside `requestAnimationFrame`.

**Pattern:** The propagation loop is additionally **decoupled from the frame loop**: rendering runs at display refresh, while `propagateAt` requests are issued only when the previous one resolves. Camera and Earth-spin stay at 60 FPS even if the worker delivers at 10 Hz.

---

## C7 — Pass Prediction Reuses the Propagator's Sample Buffers

**Decision:** Pass prediction (`src/features/ground-station/`) consumes the same `propagateRange` ECI buffers the orbit track uses. The TS side does only geometry: GMST rotation → topocentric ENU → az/el, then a linear scan for horizon crossings with interpolated AOS/LOS.

**Rationale:**

- Keeps every SGP4 evaluation in the WASM worker (C3); pass search adds no propagation code paths.
- 30 s sampling with linear AOS/LOS interpolation gives a few seconds of timing accuracy — sufficient for VHF/UHF amateur work — at ~2,880 samples per 24 h scan.

---

## C8 — IndexedDB Stale-While-Revalidate

**Decision:** OMM JSON is cached in IndexedDB with a 2-hour staleness window (CelesTrak's rate limit); SatNOGS transmitter records use a 24-hour window. Reads resolve immediately even when stale; revalidation happens in the background.

**Demo fallback:** When the cache is empty *and* CelesTrak is unreachable, `buildDemoCatalog()` synthesizes ~1,000 physically plausible OMM records (epoch = now, NORAD IDs in the 900xxx analyst range) so the app boots offline. Demo data is never written to the cache, and the status bar shows `DEMO DATA`.

---

## Directory Layout

Feature-driven layout; each feature owns its types, components, workers, and tests:

```
src/features/<feature>/
  index.ts        # Public API surface (re-exports only)
  *.ts / *.tsx    # Implementation
  __tests__/      # Co-located unit tests

src/features/
  spatial-rendering/three/   # scene manager, earth, satPoints, starfield, orbit track
  orbital-mechanics/         # WASM worker + propagator API
  telemetry-ingestion/       # CelesTrak, SatNOGS, IndexedDB cache, demo catalog
  ground-station/            # pass prediction
  osint-intelligence/        # UCS database enrichment
  ui-shell/                  # TopBar, Sidebar, detail panel, catalog table, status bar
```

`src/shared/` holds Zustand stores, shared types, and time/astro utilities (`astro.ts`: GMST, frame transforms, sun/moon ephemerides, look angles). There are no top-level `components/`, `hooks/`, or `services/` directories.
