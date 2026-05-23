# Orion — Live Demo Guide

Three commands to get ~10,000 satellites rendering in your browser.

---

## Quick Start

```bash
git clone https://github.com/d3mocide/Orion
cd Orion

# Build WASM (requires Rust stable + wasm-pack)
wasm-pack build wasm-src --target web \
  --out-dir src/features/orbital-mechanics/wasm \
  --no-pack

npm install && npm run dev
# → http://localhost:5173
```

> **First-time WASM build takes 30–60 seconds.** Install Rust via https://rustup.rs and wasm-pack via `cargo install wasm-pack`. WASM artifacts are also committed to git — if you just want to run the app without building Rust, `npm install && npm run dev` works immediately.

---

## What to Expect

### On first load (no cache)

1. The Cesium globe appears within ~1 second (static assets, no network dependency).
2. The app fetches the active satellite catalog from CelesTrak (~800 kB JSON, 1–3 seconds).
3. OMM records are written to IndexedDB and dispatched to the WASM Web Worker.
4. Within 3–5 seconds, **~10,000 satellite dots** appear on the globe at their live SGP4-propagated positions.
5. The simulation clock runs in real time. Dots move visibly when time acceleration is enabled.

### On subsequent loads (warm cache)

- The catalog loads from IndexedDB in < 100 ms. Satellites appear within ~1 second of page load.
- A background fetch checks whether CelesTrak data is older than 2 hours. If so, the catalog is refreshed silently.

---

## Interacting with the Demo

### Globe navigation

| Action | Result |
|---|---|
| Left-click + drag | Rotate globe |
| Right-click + drag | Tilt camera |
| Scroll wheel | Zoom in/out |

### Satellite interaction

| Action | Result |
|---|---|
| Hover over a dot | Tooltip: NORAD ID, name, altitude, orbital velocity |
| Click a dot | Select satellite; 90-minute orbit track appears (deck.gl LineLayer) |
| Click empty space | Deselect; orbit track removed |
| Click row in Catalog drawer | Select satellite |

### UI panels

- **Filter panel (left sidebar):** Toggle orbit regime (LEO / MEO / GEO / HEO). Operator / country / purpose facets appear when a UCS Satellite Database CSV is loaded.
- **Detail panel (right sidebar):** Orbital elements (inclination, eccentricity, mean motion, epoch) plus UCS enrichment (operator, country, purpose, launch date, mass) if UCS data is available.
- **FPS counter (top bar):** Current render frame rate — green ≥ 55, yellow ≥ 30, red < 30.
- **Time controls (top bar):** Pause (⏸), resume (▶), speed multiplier (×1 / ×10 / ×60 / ×600).
- **Catalog drawer (bottom):** Virtualized list of all ~10,000 objects. Click any row to select. Toggle with the "Catalog" button in the top bar.

### Keyboard shortcuts

No keyboard shortcuts are implemented in the current release.

---

## Docker Alternative

```bash
docker build -t orion .
docker run -p 8080:8080 orion
# → http://localhost:8080
```

> The Docker image runs the full Rust + wasm-pack compilation in a builder stage, so no local Rust toolchain is required.

---

## CelesTrak Rate Limit

CelesTrak enforces a **2-hour minimum interval** between catalog fetches per IP. Orion respects this automatically via IndexedDB timestamps. To force a fresh fetch during development, open DevTools → Application → IndexedDB → `space-tracking-cache` → `omm-data`, clear the store, and reload.

---

## Running Tests

```bash
# Unit tests (Vitest) — 9/9 passing
npm run test

# End-to-end perf smoke test (Playwright)
npx playwright install --with-deps   # first time only
npm run test:e2e
```
