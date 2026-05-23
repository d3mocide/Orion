import * as Cesium from "cesium";
import type { SatelliteStatus } from "@/shared/types/rendering";

const STATUS_COLORS: Record<SatelliteStatus, Cesium.Color> = {
  active: Cesium.Color.fromCssColorString("#22c55e"),
  inactive: Cesium.Color.fromCssColorString("#eab308"),
  debris: Cesium.Color.fromCssColorString("#ef4444"),
  unknown: Cesium.Color.fromCssColorString("#ffffff"),
};

let collection: Cesium.PointPrimitiveCollection | null = null;
let primitives: Cesium.PointPrimitive[] = [];
let noradIds: string[] = [];

// Single scratch Cartesian3 — never allocate inside the render loop
const scratchPosition = new Cesium.Cartesian3();

export function initPointPrimitivePool(scenePrimitives: Cesium.PrimitiveCollection): void {
  if (collection) {
    scenePrimitives.remove(collection);
  }
  collection = new Cesium.PointPrimitiveCollection();
  scenePrimitives.add(collection);
  primitives = [];
  noradIds = [];
}

export function allocatePoints(catalog: { noradId: string; status: SatelliteStatus }[]): void {
  if (!collection) return;

  // Remove excess
  while (primitives.length > catalog.length) {
    const p = primitives.pop();
    if (p) collection.remove(p);
  }

  // Update existing or add new
  for (let i = 0; i < catalog.length; i++) {
    const { noradId, status } = catalog[i];
    const color = STATUS_COLORS[status];

    if (i < primitives.length) {
      primitives[i].color = color;
      primitives[i].id = noradId;
    } else {
      const p = collection.add({
        position: Cesium.Cartesian3.ZERO,
        pixelSize: 2,
        color,
        id: noradId,
        show: true,
      });
      primitives.push(p);
    }
    noradIds[i] = noradId;
  }
}

/**
 * Hot path — called every requestAnimationFrame.
 * positions: Float64Array layout [x0,y0,z0, x1,y1,z1, ...] ECI km
 * Uses single scratch Cartesian3 — zero per-frame allocations.
 */
export function updatePointPositions(positions: Float64Array): void {
  if (!collection) return;
  const count = Math.min(primitives.length, positions.length / 3);

  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    // Skip invalid positions (e.g. propagation errors returned 0,0,0)
    if (x === 0 && y === 0 && z === 0) continue;

    // ECI km → ECEF m (scale only; Phase 2 adds proper ECI→ECEF rotation)
    scratchPosition.x = x * 1000;
    scratchPosition.y = y * 1000;
    scratchPosition.z = z * 1000;

    primitives[i].position = scratchPosition;
  }
}

export function setPointVisibility(noradId: string, visible: boolean): void {
  const idx = noradIds.indexOf(noradId);
  if (idx >= 0 && primitives[idx]) {
    primitives[idx].show = visible;
  }
}

export function getNoradIds(): readonly string[] {
  return noradIds;
}
