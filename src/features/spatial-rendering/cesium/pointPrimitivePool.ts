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
const J2000 = 2_451_545.0;

function gmstRad(jdUtc: number): number {
  const deg = 280.46061837 + 360.98564736629 * (jdUtc - J2000);
  return (((deg % 360) + 360) % 360) * (Math.PI / 180);
}

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

  while (primitives.length > catalog.length) {
    const p = primitives.pop();
    if (p) collection.remove(p);
  }

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
 * jdUtc: Julian Date for GMST rotation (ECI → ECEF)
 * Zero per-frame allocations.
 */
export function updatePointPositions(positions: Float64Array, jdUtc: number): void {
  if (!collection) return;
  const theta = gmstRad(jdUtc);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const count = Math.min(primitives.length, Math.floor(positions.length / 3));

  for (let i = 0; i < count; i++) {
    const xEci = positions[i * 3];
    const yEci = positions[i * 3 + 1];
    const zEci = positions[i * 3 + 2];

    if (xEci === 0 && yEci === 0 && zEci === 0) continue;

    // ECI (km) → ECEF (m) via GMST rotation
    scratchPosition.x = (xEci * cosT + yEci * sinT) * 1000;
    scratchPosition.y = (-xEci * sinT + yEci * cosT) * 1000;
    scratchPosition.z = zEci * 1000;

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

/** Read raw ECI position (km) for a slot index from a propagation buffer. */
export function getEciAtIndex(
  positions: Float64Array,
  idx: number,
): { x: number; y: number; z: number } | null {
  const base = idx * 3;
  if (base + 2 >= positions.length) return null;
  const x = positions[base];
  const y = positions[base + 1];
  const z = positions[base + 2];
  return x === 0 && y === 0 && z === 0 ? null : { x, y, z };
}
