/**
 * Selected-satellite orbit track: a single THREE.Line in the ECI frame with a
 * per-vertex alpha fade (bright at the satellite's current position, fading
 * around the orbit), a pulsing selection ring, and apogee/perigee markers
 * with distance labels.
 */

import * as THREE from "three";
import { KM_TO_UNITS } from "./constants";

const R_EARTH_KM = 6371;

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
    gl_FragColor = vec4(uColor, vFade * 0.8);
  }
`;

function makeRingTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "rgba(244, 244, 245, 0.95)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Diamond + text label rendered to a canvas sprite (e.g. "APO 829 km") */
function makeLabelSprite(text: string, color: string): THREE.Sprite {
  const w = 256;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Diamond marker on the left
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(20, 32 - 9);
  ctx.lineTo(29, 32);
  ctx.lineTo(20, 32 + 9);
  ctx.lineTo(11, 32);
  ctx.closePath();
  ctx.stroke();

  ctx.font = "500 22px 'JetBrains Mono', monospace";
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 40, 33);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  sprite.center.set(0.08, 0.5); // anchor near the diamond
  sprite.visible = false;
  sprite.renderOrder = 3;
  return sprite;
}

export interface OrbitTrackHandle {
  /** Replace the track with a new ECI sample buffer (km); null clears it.
   *  colorCss tints the line (defaults to neutral grey). */
  setTrack: (positions: Float64Array | null, colorCss?: string) => void;
  /** Move the selection marker to an ECI position (km); null hides it */
  setMarker: (eciKm: { x: number; y: number; z: number } | null) => void;
  /** Per-frame pulse animation + camera-distance scaling */
  update: (elapsedSec: number, cameraDistance: number) => void;
  dispose: () => void;
}

export function createOrbitTrack(scene: THREE.Scene): OrbitTrackHandle {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#d4d4d8") } },
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

  let apoSprite: THREE.Sprite | null = null;
  let periSprite: THREE.Sprite | null = null;

  const disposeApsides = () => {
    for (const s of [apoSprite, periSprite]) {
      if (!s) continue;
      scene.remove(s);
      s.material.map?.dispose();
      s.material.dispose();
    }
    apoSprite = null;
    periSprite = null;
  };

  return {
    setTrack(positions, colorCss) {
      disposeApsides();
      (material.uniforms.uColor.value as THREE.Color).set(colorCss ?? "#d4d4d8");
      if (!positions || positions.length < 6) {
        line.visible = false;
        return;
      }
      const n = Math.floor(positions.length / 3);
      const verts = new Float32Array(n * 3);
      const fade = new Float32Array(n);
      let apoIdx = 0;
      let periIdx = 0;
      let rMax = -Infinity;
      let rMin = Infinity;

      for (let i = 0; i < n; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        verts[i * 3] = x * KM_TO_UNITS;
        verts[i * 3 + 1] = y * KM_TO_UNITS;
        verts[i * 3 + 2] = z * KM_TO_UNITS;
        // Track starts at "now": full brightness, fading along the orbit
        fade[i] = 1.0 - (i / (n - 1)) * 0.85;

        const r = Math.hypot(x, y, z);
        if (r > rMax) {
          rMax = r;
          apoIdx = i;
        }
        if (r > 0 && r < rMin) {
          rMin = r;
          periIdx = i;
        }
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(verts, 3));
      geometry.setAttribute("aFade", new THREE.BufferAttribute(fade, 1));
      geometry.computeBoundingSphere();
      line.visible = true;

      // Apsis markers (skip for near-circular sampled orbits < 30 km spread)
      if (isFinite(rMax) && isFinite(rMin) && rMax - rMin > 30) {
        apoSprite = makeLabelSprite(`APO ${(rMax - R_EARTH_KM).toFixed(0)} km`, "#e8b44a");
        periSprite = makeLabelSprite(`PER ${(rMin - R_EARTH_KM).toFixed(0)} km`, "#9ca3af");
        apoSprite.position.set(verts[apoIdx * 3], verts[apoIdx * 3 + 1], verts[apoIdx * 3 + 2]);
        periSprite.position.set(verts[periIdx * 3], verts[periIdx * 3 + 1], verts[periIdx * 3 + 2]);
        apoSprite.visible = true;
        periSprite.visible = true;
        scene.add(apoSprite);
        scene.add(periSprite);
      }
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
      const labelScale = Math.max(cameraDistance * 0.055, 0.8);
      if (apoSprite) apoSprite.scale.set(labelScale * 2, labelScale * 0.5, 1);
      if (periSprite) periSprite.scale.set(labelScale * 2, labelScale * 0.5, 1);

      if (!marker.visible) return;
      const pulse = 1 + 0.18 * Math.sin(elapsedSec * 3.2);
      const scale = Math.max(cameraDistance * 0.022, 0.35) * pulse;
      marker.scale.setScalar(scale);
      (marker.material as THREE.SpriteMaterial).opacity = 0.75 + 0.25 * Math.sin(elapsedSec * 3.2);
    },

    dispose() {
      disposeApsides();
      scene.remove(line);
      scene.remove(marker);
      geometry.dispose();
      material.dispose();
      marker.material.map?.dispose();
      marker.material.dispose();
    },
  };
}
