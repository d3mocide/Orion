/**
 * Selected-satellite orbit track: a single THREE.Line in the ECI frame with a
 * per-vertex alpha fade (bright at the satellite's current position, fading
 * around the orbit), plus a pulsing selection marker sprite.
 */

import * as THREE from "three";
import { KM_TO_UNITS } from "./constants";

const TRACK_VERT = /* glsl */ `
  attribute float aFade;
  varying float vFade;
  void main() {
    vFade = aFade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRACK_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(uColor, vFade * 0.85);
  }
`;

function makeRingTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "rgba(45, 212, 191, 1)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
  ctx.stroke();
  // Soft outer glow
  const grad = ctx.createRadialGradient(size / 2, size / 2, size / 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(45, 212, 191, 0)");
  grad.addColorStop(0.8, "rgba(167, 139, 250, 0.25)");
  grad.addColorStop(1, "rgba(167, 139, 250, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface OrbitTrackHandle {
  /** Replace the track with a new ECI sample buffer (km); null clears it */
  setTrack: (positions: Float64Array | null) => void;
  /** Move the selection marker to an ECI position (km); null hides it */
  setMarker: (eciKm: { x: number; y: number; z: number } | null) => void;
  /** Per-frame pulse animation + camera-distance scaling */
  update: (elapsedSec: number, cameraDistance: number) => void;
  dispose: () => void;
}

export function createOrbitTrack(scene: THREE.Scene): OrbitTrackHandle {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#2dd4bf") } },
    vertexShader: TRACK_VERT,
    fragmentShader: TRACK_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  line.visible = false;
  line.renderOrder = 1;
  scene.add(line);

  const marker = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeRingTexture(),
      transparent: true,
      depthWrite: false,
      depthTest: false,
    }),
  );
  marker.visible = false;
  marker.renderOrder = 3;
  scene.add(marker);

  return {
    setTrack(positions) {
      if (!positions || positions.length < 6) {
        line.visible = false;
        return;
      }
      const n = Math.floor(positions.length / 3);
      const verts = new Float32Array(n * 3);
      const fade = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        verts[i * 3] = positions[i * 3] * KM_TO_UNITS;
        verts[i * 3 + 1] = positions[i * 3 + 1] * KM_TO_UNITS;
        verts[i * 3 + 2] = positions[i * 3 + 2] * KM_TO_UNITS;
        // Track starts at "now": full brightness, fading along the orbit
        fade[i] = 1.0 - (i / (n - 1)) * 0.85;
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(verts, 3));
      geometry.setAttribute("aFade", new THREE.BufferAttribute(fade, 1));
      geometry.computeBoundingSphere();
      line.visible = true;
    },

    setMarker(eciKm) {
      if (!eciKm) {
        marker.visible = false;
        return;
      }
      marker.position.set(eciKm.x * KM_TO_UNITS, eciKm.y * KM_TO_UNITS, eciKm.z * KM_TO_UNITS);
      marker.visible = true;
    },

    update(elapsedSec, cameraDistance) {
      if (!marker.visible) return;
      const pulse = 1 + 0.18 * Math.sin(elapsedSec * 3.2);
      const scale = Math.max(cameraDistance * 0.022, 0.35) * pulse;
      marker.scale.setScalar(scale);
      (marker.material as THREE.SpriteMaterial).opacity = 0.75 + 0.25 * Math.sin(elapsedSec * 3.2);
    },

    dispose() {
      scene.remove(line);
      scene.remove(marker);
      geometry.dispose();
      material.dispose();
      marker.material.map?.dispose();
      marker.material.dispose();
    },
  };
}
