# Space Tracking Dashboard — Build Tracker

> Last updated: 2026-05-23
> Branch: `claude/inspiring-hypatia-rTwEN`

---

## Overall Progress

| Phase | Status | Target |
|-------|--------|--------|
| Phase 1 — Skeleton & Pipelines | ✅ Complete | Day 1 |
| Phase 2 — WASM Propagation | ⏳ Not Started | Day 2–3 |
| Phase 3 — Rendering | ⏳ Not Started | Day 3–5 |
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

### Commits Planned

- [ ] **P2-C1:** Rust workspace + sgp4 crate scaffold
  - `/wasm-src/` Rust workspace with `Cargo.toml`
  - Depends on `sgp4` crate
  - Exposes `init_catalog`, `propagate_at_jd`, `propagate_range` via `wasm-bindgen`
  - Verify: `wasm-pack build --target web` succeeds

- [ ] **P2-C2:** WASM output wired into Vite
  - Built artifacts in `src/features/orbital-mechanics/wasm/`
  - `vite.config.ts` WASM support via `vite-plugin-wasm` or inline `assetsInclude`
  - Verify: WASM module imports without error in browser

- [ ] **P2-C3:** Propagator Web Worker + Comlink
  - `src/features/orbital-mechanics/worker/propagator.worker.ts`
  - `src/features/orbital-mechanics/worker/propagator.api.ts` (Comlink-exposed interface)
  - Implements `PropagatorAPI`: `loadCatalog`, `propagateAt`, `propagateRange`, `getMetadata`
  - `propagateAt` returns `Float64Array.buffer` as Transferable
  - Verify: worker compiles, Comlink wrapping works

- [ ] **P2-C4:** Propagation smoke test
  - Load 1,000 OMM records → call `propagateAt(now)` → verify 3,000 finite numbers
  - Verify buffer becomes detached in worker (zero-copy confirmed)
  - Verify: 10,000 objects propagated in < 16 ms (logged to console)

- [ ] **P2-C5:** CI: add `wasm-pack` to CI build
  - Install Rust toolchain + `wasm-pack` in `.github/workflows/ci.yml`
  - Verify: CI builds WASM artifacts before TypeScript compilation

### Phase 2 Acceptance Criteria
- [ ] Worker propagates 10,000 objects in < 16 ms
- [ ] Buffer transfer is zero-copy (source buffer detached after transfer)
- [ ] WASM build reproducible in CI

---

## Phase 3 — Rendering

### Commits Planned

- [ ] **P3-C1:** PointPrimitiveCollection pool
  - `src/features/spatial-rendering/cesium/pointPrimitivePool.ts`
  - Single collection, N primitives pre-allocated on `loadCatalog`
  - Frame update: reads `Float64Array`, writes positions via scratch `Cartesian3`
  - Zero per-frame allocations
  - Verify: primitives appear on globe at correct ECI positions

- [ ] **P3-C2:** requestAnimationFrame render loop
  - Loop lives outside React reconciliation (plain `rAF` in `CesiumGlobe.tsx` effect, never in React state)
  - Calls `propagateAt(currentJd)`, awaits buffer, updates collection
  - FPS counter in Zustand `ui.store.ts`, updated every second
  - Verify: 60 FPS at 10k objects (FPS counter shows ≥55)

- [ ] **P3-C3:** deck.gl overlay integration
  - `src/features/spatial-rendering/deckgl/overlay.ts`
  - `Deck` instance driven by Cesium camera each frame
  - `src/features/spatial-rendering/deckgl/layers/orbitTrackLayer.ts` — LineLayer
  - `src/features/spatial-rendering/deckgl/layers/debrisDensityLayer.ts` — stub

- [ ] **P3-C4:** Hardware picking + tooltip
  - deck.gl hardware picking for orbit tracks
  - Cesium `scene.pick` debounced 60 ms for point hover
  - Hover → tooltip (name, NORAD ID, alt, velocity)
  - Click → selection store updated

- [ ] **P3-C5:** UI shell layout
  - `src/features/ui-shell/Sidebar.tsx` — left rail filter panel mount
  - Top bar with sim-time, FPS counter, catalog size
  - Glass-morphism panels per §7 spec

### Phase 3 Acceptance Criteria
- [ ] 60 FPS at 10,000 objects on mid-range GPU
- [ ] React DevTools profiler: zero commits during animation (only on user action)
- [ ] Hover tooltip appears < 50 ms
- [ ] Orbital track draws on satellite selection

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
| C1 | No TLE parsing — OMM JSON only | ⏳ Enforced in P1-C4 |
| C2 | No Entity API — PointPrimitiveCollection only | ⏳ Enforced in P3-C1 |
| C3 | SGP4 in WASM Web Worker | ⏳ P2 |
| C4 | Transferable ArrayBuffer, no JSON.stringify | ⏳ P2-C3 |
| C5 | Render loop outside React reconciliation | ⏳ P3-C2 |
| C6 | Feature-driven directory layout | ⏳ P1-C2 |
| C7 | SWR cache via IndexedDB | ⏳ P1-C5 |
| C8 | Tailwind only (no bespoke CSS) | ⏳ P1-C1 |

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
