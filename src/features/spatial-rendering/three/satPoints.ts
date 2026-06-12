/**
 * Satellite point cloud — one THREE.Points draw call for the whole catalog.
 *
 * Positions stay in the ECI frame (the Earth mesh rotates by GMST instead),
 * so the per-frame hot path is a single Float64→Float32 copy with zero trig
 * and zero heap allocations. Visibility filtering writes a per-vertex
 * attribute; hidden points get gl_PointSize = 0.
 *
 * Module-level singleton, mirroring the old pointPrimitivePool API.
 */

import * as THREE from "three";
import type { SatelliteStatus } from "@/shared/types/rendering";
import type { OrbitRegime } from "@/shared/store/filters.store";
import { KM_TO_UNITS, REGIME_COLORS } from "./constants";

const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aVisible;
  uniform float uPixelRatio;
  varying vec3 vColor;

  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float size = 110.0 / max(-mv.z, 1.0);
    gl_PointSize = clamp(size, 2.2, 9.0) * uPixelRatio * aVisible;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float halo = smoothstep(0.5, 0.12, d);
    float core = smoothstep(0.22, 0.0, d);
    vec3 color = vColor * (0.85 + core * 0.9);
    gl_FragColor = vec4(color, halo * 0.95);
    if (halo < 0.01) discard;
  }
`;

export interface PointCatalogEntry {
  noradId: string;
  status: SatelliteStatus;
  regime: OrbitRegime;
  operator: string;
  country: string;
  purpose: string;
}

let points: THREE.Points | null = null;
let geometry: THREE.BufferGeometry | null = null;
let material: THREE.ShaderMaterial | null = null;
let sceneRef: THREE.Scene | null = null;

let capacity = 0;
let count = 0;
let noradIds: string[] = [];
let slotRegimes: OrbitRegime[] = [];
let slotOperators: string[] = [];
let slotCountries: string[] = [];
let slotPurposes: string[] = [];
let visibleFlags: Float32Array = new Float32Array(0);

export function initSatPoints(scene: THREE.Scene): void {
  disposeSatPoints();
  sceneRef = scene;
}

export function disposeSatPoints(): void {
  if (points && sceneRef) sceneRef.remove(points);
  geometry?.dispose();
  material?.dispose();
  points = null;
  geometry = null;
  material = null;
  capacity = 0;
  count = 0;
  noradIds = [];
  slotRegimes = [];
  slotOperators = [];
  slotCountries = [];
  slotPurposes = [];
}

function ensureCapacity(n: number): void {
  if (!sceneRef) return;
  if (n <= capacity && points) {
    count = n;
    geometry!.setDrawRange(0, n);
    return;
  }

  if (points) sceneRef.remove(points);
  geometry?.dispose();

  capacity = Math.ceil(n * 1.2);
  count = n;

  geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
  visibleFlags = new Float32Array(capacity).fill(1);
  geometry.setAttribute("aVisible", new THREE.BufferAttribute(visibleFlags, 1));
  geometry.setDrawRange(0, n);
  // ECI positions arrive asynchronously; never let three cull the cloud
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  if (!material) {
    material = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: window.devicePixelRatio || 1 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  sceneRef.add(points);
}

export function allocatePoints(catalog: PointCatalogEntry[]): void {
  if (!sceneRef) return;
  ensureCapacity(catalog.length);
  if (!geometry) return;

  noradIds = new Array(catalog.length);
  slotRegimes = new Array(catalog.length);
  slotOperators = new Array(catalog.length);
  slotCountries = new Array(catalog.length);
  slotPurposes = new Array(catalog.length);

  const colorAttr = geometry.getAttribute("aColor") as THREE.BufferAttribute;
  const colors = colorAttr.array as Float32Array;

  for (let i = 0; i < catalog.length; i++) {
    const { noradId, regime, operator, country, purpose } = catalog[i];
    noradIds[i] = noradId;
    slotRegimes[i] = regime;
    slotOperators[i] = operator;
    slotCountries[i] = country;
    slotPurposes[i] = purpose;

    const c = REGIME_COLORS[regime] ?? REGIME_COLORS.LEO;
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }
  colorAttr.needsUpdate = true;
}

/**
 * Hot path — copy a propagation buffer (ECI km) into the GPU position attribute.
 * Zero allocations; one attribute upload per call.
 */
export function updatePointPositions(positions: Float64Array): void {
  if (!geometry) return;
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const out = posAttr.array as Float32Array;
  const n = Math.min(count, Math.floor(positions.length / 3));

  for (let i = 0; i < n * 3; i++) {
    out[i] = positions[i] * KM_TO_UNITS;
  }
  posAttr.needsUpdate = true;
}

/** Apply visibility filters in O(n). Empty filter set = "show all". */
export function applyFilters(
  regimes: ReadonlySet<OrbitRegime>,
  operators: ReadonlySet<string>,
  countries: ReadonlySet<string>,
  purposes: ReadonlySet<string>,
): void {
  if (!geometry) return;
  const allRegimes = regimes.size === 0;
  const allOps = operators.size === 0;
  const allCtrs = countries.size === 0;
  const allPurps = purposes.size === 0;

  const attr = geometry.getAttribute("aVisible") as THREE.BufferAttribute;
  for (let i = 0; i < count; i++) {
    const show =
      (allRegimes || regimes.has(slotRegimes[i])) &&
      (allOps || slotOperators[i] === "" || operators.has(slotOperators[i])) &&
      (allCtrs || slotCountries[i] === "" || countries.has(slotCountries[i])) &&
      (allPurps || slotPurposes[i] === "" || purposes.has(slotPurposes[i]));
    visibleFlags[i] = show ? 1 : 0;
  }
  attr.needsUpdate = true;
}

export function getNoradIds(): readonly string[] {
  return noradIds;
}

export function getSlotIndex(noradId: string): number {
  return noradIds.indexOf(noradId);
}

export function getSlotRegime(noradId: string): OrbitRegime | null {
  const idx = noradIds.indexOf(noradId);
  return idx >= 0 ? slotRegimes[idx] : null;
}

export function isSlotVisible(idx: number): boolean {
  return visibleFlags[idx] === 1;
}

/** Read raw ECI position (km) for a slot index from a propagation buffer. */
export function getEciAtIndex(
  positions: Float64Array,
  idx: number,
): { x: number; y: number; z: number } | null {
  const base = idx * 3;
  if (base + 2 >= positions.length || idx < 0) return null;
  const x = positions[base];
  const y = positions[base + 1];
  const z = positions[base + 2];
  return x === 0 && y === 0 && z === 0 ? null : { x, y, z };
}

const scratchVec = new THREE.Vector3();

/**
 * Screen-space picking: project every visible point and return the slot index
 * nearest the cursor within `thresholdPx`. O(n) but only runs on debounced
 * pointer events, never per-frame.
 */
export function pickSatellite(
  clientX: number,
  clientY: number,
  camera: THREE.PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
  thresholdPx = 14,
): string | null {
  if (!geometry) return null;
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;

  let bestIdx = -1;
  let bestDist = thresholdPx * thresholdPx;
  let bestDepth = Infinity;

  for (let i = 0; i < count; i++) {
    if (visibleFlags[i] !== 1) continue;
    const x = arr[i * 3];
    const y = arr[i * 3 + 1];
    const z = arr[i * 3 + 2];
    if (x === 0 && y === 0 && z === 0) continue;

    scratchVec.set(x, y, z).project(camera);
    if (scratchVec.z > 1 || scratchVec.z < -1) continue;

    const sx = (scratchVec.x * 0.5 + 0.5) * viewportWidth;
    const sy = (-scratchVec.y * 0.5 + 0.5) * viewportHeight;
    const dx = sx - clientX;
    const dy = sy - clientY;
    const d2 = dx * dx + dy * dy;

    if (d2 < bestDist || (d2 === bestDist && scratchVec.z < bestDepth)) {
      bestDist = d2;
      bestDepth = scratchVec.z;
      bestIdx = i;
    }
  }

  return bestIdx >= 0 ? noradIds[bestIdx] : null;
}
