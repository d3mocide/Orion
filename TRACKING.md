# Space Tracking Dashboard — Build Tracker

> Last updated: 2026-05-23
> Branch: `claude/inspiring-hypatia-rTwEN`

---

## Overall Progress

| Phase | Status | Target |
|-------|--------|--------|
| Phase 1 — Skeleton & Pipelines | ✅ Complete | Day 1 |
| Phase 2 — WASM Propagation | ✅ Complete | Day 2–3 |
| Phase 3 — Rendering | ✅ Complete | Day 3–5 |
| Phase 4 — OSINT & Polish | ⏳ Not Started | Day 5–7 |

---

## Phase 1 — Skeleton & Pipelines

### Commits Planned

- [x] **P1-C1:** Scaffold Vite 5 + React 18 + TypeScript (strict) + Tailwind 3
  - `package.json`, `vite.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `index.html`
  - `src/main.tsx`, `src/App.tsx` (thin shell), `src/index.css`
  - ESLint + Prettier + lefthook pre-commit config
  - Verify: `npm run dev` renders blank Tailwind dark page

- [x] **P1-C2:** Full feature directory structure + barrel stubs
  - All directories from §4 created with placeholder `index.ts` barrels
  - All shared type stubs in `src/shared/types/`
  - `src/features/orbital-mechanics/types.ts` with OMM, StateVector, EphemerisBatch interfaces
  - Verify: `npm run typecheck` passes

- [x] **P1-C3:** CesiumJS globe integration
  - `vite-plugin-cesium` configured in `vite.config.ts`
  - `src/features/spatial-rendering/cesium/CesiumGlobe.tsx` — bare globe, no Entity API
  - Disabled UI elements per §6.1, fallback imagery provider
  - Globe mounted in `App.tsx` full-bleed
  - Verify: Cesium globe renders at `localhost:5173`

- [x] **P1-C4:** CelesTrak OMM JSON client
  - `src/features/telemetry-ingestion/clients/celestrak.ts`
  - Fetches `GROUP=active&FORMAT=json` and `GROUP=starlink&FORMAT=json`
  - Follows 301 redirects to `.org` domain
  - Rate-limit guard: throws if last fetch < 2h ago (enforced per group)
  - Parses OMM JSON, validates `NORAD_CAT_ID` is string (never integer)
  - Verify: unit test fetches mock OMM JSON, parses correctly

- [x] **P1-C5:** IndexedDB SWR cache
  - `src/features/telemetry-ingestion/cache/indexeddb.ts`
  - DB: `space-tracking-cache` v1, stores: `omm-data`, `ucs-database`, `metadata`
  - SWR boot sequence: read cached → propagate → check staleness (2h) → revalidate in background
  - `src/features/telemetry-ingestion/index.ts` public API wires client + cache
  - Verify: on second boot, data loads from IndexedDB before network

- [x] **P1-C6:** Zustand stores (UI state atoms)
  - `src/shared/store/selection.store.ts` — selected NORAD ID
  - `src/shared/store/filters.store.ts` — operator/country/purpose/regime filters
  - `src/shared/store/ui.store.ts` — sidebar open/closed, sim-time, FPS, catalog size
  - Verify: typecheck passes, no circular deps

- [x] **P1-C7:** GitHub Actions CI workflow
  - `.github/workflows/ci.yml`: lint → typecheck → test → build
  - Verify: workflow YAML is valid

- [x] **P1-C8:** Multi-stage Dockerfile + docker-compose
  - `Dockerfile`: node-alpine build stage → nginx serve
  - `docker-compose.yml`
  - Verify: `docker build .` succeeds

### Phase 1 Acceptance Criteria
- [ ] `npm run dev` — Cesium globe renders in browser (verify manually)
- [ ] IndexedDB contains OMM JSON after first load (verify in DevTools → Application → IndexedDB)
- [x] `npm run typecheck` — zero errors ✅
- [x] `npm run lint` — zero errors ✅
- [x] `npm run test` — 4/4 unit tests pass (CelesTrak parsing + rate limit) ✅
- [x] `npm run build` — production build succeeds (165 kB main bundle) ✅
- [x] CI workflow file exists and is syntactically valid ✅

---

## Phase 2 — WASM Propagation

### Commits

- [x] **P2-C1:** Rust workspace + sgp4 crate scaffold ✅
  - `/wasm-src/` Rust workspace with `Cargo.toml`
  - `sgp4` crate with serde feature — OMM JSON deserializes directly into `Elements`
  - Exposes `load_catalog`, `propagate_at_jd`, `propagate_range`, `get_metadata`, `catalog_size`

- [x] **P2-C2:** WASM output wired into Vite ✅
  - Built artifacts committed to `src/features/orbital-mechanics/wasm/`
  - `vite-plugin-wasm` + `vite-plugin-top-level-await` in vite.config.ts

- [x] **P2-C3:** Propagator Web Worker + Comlink ✅
  - `propagator.worker.ts` lazy-loads WASM via dynamic import + `mod.default()`
  - Implements full `PropagatorAPI`; `propagateAt` transfers `Float64Array.buffer`

- [x] **P2-C4:** Propagation smoke test ✅
  - 5/5 tests pass; 10k SGP4 in ~9.7ms (Node/no SIMD); NORAD IDs always strings

- [x] **P2-C5:** CI: add `wasm-pack` to CI build ✅
  - `dtolnay/rust-toolchain@stable` + `actions/cache@v4` for cargo
  - `wasm-pack build` runs before `npm ci`

### Phase 2 Acceptance Criteria
- [x] Worker propagates 10,000 objects in < 16 ms (9.7ms in Node without SIMD) ✅
- [x] Buffer transfer is zero-copy (slice().buffer transferred as Transferable) ✅
- [x] WASM build reproducible in CI ✅

---

## Phase 3 — Rendering

### Commits

- [x] **P3-C1:** PointPrimitiveCollection pool ✅
  - `pointPrimitivePool.ts`: single scratch `Cartesian3`, zero per-frame allocations
  - **ECI→ECEF rotation via GMST** — `updatePointPositions(positions, jdUtc)` rotates each frame
  - `getEciAtIndex()` helper for tooltip altitude computation

- [x] **P3-C2:** requestAnimationFrame render loop ✅
  - rAF lives in `CesiumGlobe.tsx` useEffect, never in React state
  - Reads `simSpeed`/`simPaused` directly from Zustand store (no stale closures)
  - FPS counter updated every second via `setFps()`

- [x] **P3-C3:** deck.gl overlay integration ✅
  - `overlay.ts`: real `Deck` instance with `GlobeView`, transparent canvas overlay
  - Camera sync: Cesium → deck.gl viewState each rAF frame
  - `orbitTrackLayer.ts`: `eciToWgs84()` + `buildOrbitSegments()` → deck.gl `LineLayer`
  - `debrisDensityLayer.ts`: stub (Phase 4)

- [x] **P3-C4:** Hardware picking + tooltip ✅
  - Cesium `scene.pick` debounced 60 ms for hover → `hoveredNoradId` in store
  - Tooltip: NORAD ID, name (async `getMetadata`, cached), altitude (from ECI magnitude), velocity (~circular orbit approx)
  - Click → `selectedNoradId` in store; orbit track fetched via `propagateRange`
  - Orbit track: 90-minute forward track, 30-second steps, rendered as deck.gl `LineLayer`

- [x] **P3-C5:** UI shell layout ✅
  - Glass-morphism TopBar: sim-time, FPS (color-coded), catalog count, playback controls
  - Collapsible Sidebar with orbit-regime filter chips
  - SatelliteDetailPanel stub (NORAD ID visible, UCS join in Phase 4)

### Phase 3 Acceptance Criteria
- [x] rAF loop drives animation, zero React commits during propagation ✅
- [x] Hover tooltip appears within 60 ms debounce window ✅
- [x] Orbital track draws on satellite selection (deck.gl LineLayer) ✅
- [ ] 60 FPS at 10,000 objects — verify in browser (pending manual test)

---

## Phase 4 — OSINT & Polish

### Commits Planned

- [ ] **P4-C1:** UCS Database parser + entity resolver
  - `src/features/osint-intelligence/ucs-database.ts`
  - `src/features/osint-intelligence/entityResolver.ts`
  - `Map<noradId, UCSRecord>` index

- [ ] **P4-C2:** Filter panel wired to Zustand
  - `src/features/ui-shell/FilterPanel.tsx`
  - Operator / country / purpose / orbit regime facets
  - Filter toggle: `pointPrimitive.show = bool` (< 16 ms per §9)

- [ ] **P4-C3:** Satellite detail panel
  - `src/features/ui-shell/SatelliteDetailPanel.tsx`
  - Populated from UCS join on selection
  - "Next visual pass" is stubbed

- [ ] **P4-C4:** Virtualized catalog table
  - `src/features/ui-shell/VirtualizedCatalogTable.tsx`
  - `@tanstack/react-virtual` — 10k+ rows at 60 FPS
  - Collapsible bottom drawer

- [ ] **P4-C5:** Stub clients + documentation
  - `src/features/telemetry-ingestion/clients/satnogs.ts` — stub with mock
  - `src/features/space-weather/noaa-spot.ts` — stub with mock
  - `src/features/telemetry-ingestion/clients/spacetrack.ts` — auth stub
  - Stubs documented in README

- [ ] **P4-C6:** Performance smoke test
  - `/scripts/perf-smoke.ts` Playwright test
  - Asserts FPS ≥ 55 for 30 seconds at 10k objects

- [ ] **P4-C7:** Final documentation
  - `README.md` — setup, dev workflow, architecture diagram (Mermaid), known stubs, perf numbers
  - `ARCHITECTURE.md` — OMM-not-TLE decision, PointPrimitiveCollection-not-Entity, Comlink + Transferable pattern
  - `DEMO.md` — three commands to reproduce 10k-object live demo

### Phase 4 Acceptance Criteria
- [ ] All §9 performance metrics met (documented with measurements)
- [ ] Filter toggle < 16 ms
- [ ] Detail panel populates from UCS data
- [ ] Playwright perf-smoke passes (FPS ≥ 55 for 30s)
- [ ] `docker run -p 8080:8080 <image>` serves production build

---

## Hard Constraints Checklist (§2)

| # | Constraint | Status |
|---|-----------|--------|
| C1 | No TLE parsing — OMM JSON only | ✅ Enforced in P1-C4; `NORAD_CAT_ID` always string |
| C2 | No Entity API — PointPrimitiveCollection only | ✅ P3-C1; orbit track via deck.gl LineLayer |
| C3 | SGP4 in WASM Web Worker | ✅ P2: Rust sgp4 crate, Comlink worker |
| C4 | Transferable ArrayBuffer, no JSON.stringify in hot path | ✅ P2-C3: `slice().buffer` transferred |
| C5 | Render loop outside React reconciliation | ✅ P3-C2: rAF in useEffect, Zustand reads imperatively |
| C6 | Feature-driven directory layout | ✅ P1-C2 |
| C7 | SWR cache via IndexedDB | ✅ P1-C5: read→render→revalidate pattern |
| C8 | Tailwind only (no bespoke CSS) | ✅ P1-C1 |

---

## Known Stubs (Documented Limitations)

- `satnogs.ts` — RF telemetry client returns mock data
- `noaa-spot.ts` — space weather returns mock data
- `spacetrack.ts` — auth flow stubbed (requires Space-Track account)
- "Next visual pass" in detail panel is a placeholder
- ECI → ECEF conversion done in WASM (not GPU shader — GPU path is future work)

---

## Anti-Pattern Audit

On each PR, verify none of the following appear:
- `setInterval(() => setState(...))` driving render
- `JSON.stringify` on propagation results
- `Cesium.Entity` with `CallbackProperty` for satellite position
- React state subscriptions to sim-time triggering re-renders
- `NORAD_CAT_ID` parsed as fixed-width integer
- `new Cesium.Cartesian3(...)` inside rAF loop
- Single file > 250 lines mixing data, rendering, UI
- `/features/orbital-mechanics/` importing from Cesium
