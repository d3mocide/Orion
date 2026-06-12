/**
 * Deep-sky backdrop: a procedural starfield plus a slowly-breathing nebula
 * dome. Both are generated in-shader/in-code — zero texture downloads — and
 * sit at a fixed radius in the ECI frame (real stars don't rotate with Earth).
 */

import * as THREE from "three";

const STAR_COUNT = 7000;
const STAR_RADIUS = 2600;

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vTwinklePhase;

  void main() {
    vColor = aColor;
    vTwinklePhase = fract(aSize * 17.31);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vColor;
  varying float vTwinklePhase;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float alpha = smoothstep(0.5, 0.08, d);
    float twinkle = 0.75 + 0.25 * sin(uTime * 1.7 + vTwinklePhase * 6.2831);
    gl_FragColor = vec4(vColor, alpha * twinkle);
  }
`;

const NEBULA_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Value-noise FBM over the view direction: dim aurora nebula + milky-way band
const NEBULA_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.1;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float t = uTime * 0.008;

    float n1 = fbm(dir * 3.0 + vec3(t, 0.0, -t));
    float n2 = fbm(dir * 6.5 - vec3(0.0, t, t));

    // Galactic band: brighter wisps near a tilted great circle
    float band = exp(-abs(dot(dir, normalize(vec3(0.25, 0.42, 0.87)))) * 4.5);

    vec3 violet = vec3(0.30, 0.16, 0.52);
    vec3 teal = vec3(0.05, 0.35, 0.38);
    vec3 magenta = vec3(0.45, 0.12, 0.38);

    vec3 color = violet * n1 * n1 * 0.55
               + teal * n2 * n2 * 0.4
               + magenta * band * n1 * 0.65
               + vec3(0.55, 0.6, 0.8) * band * 0.12;

    gl_FragColor = vec4(color * 0.32, 1.0);
  }
`;

export interface StarfieldHandle {
  objects: THREE.Object3D[];
  update: (elapsedSec: number) => void;
}

export function createStarfield(): StarfieldHandle {
  // Stars — deterministic LCG so snapshots are stable
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const positions = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const colors = new Float32Array(STAR_COUNT * 3);

  const palette: [number, number, number][] = [
    [1.0, 1.0, 1.0],
    [0.78, 0.85, 1.0], // blue-white
    [1.0, 0.92, 0.78], // warm
    [0.65, 0.95, 0.92], // teal accent
    [0.85, 0.75, 1.0], // violet accent
  ];

  for (let i = 0; i < STAR_COUNT; i++) {
    // Uniform on sphere
    const z = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    positions[i * 3] = STAR_RADIUS * r * Math.cos(phi);
    positions[i * 3 + 1] = STAR_RADIUS * r * Math.sin(phi);
    positions[i * 3 + 2] = STAR_RADIUS * z;

    const mag = rand();
    sizes[i] = 1.2 + mag * mag * 3.4;

    const c = palette[Math.floor(rand() * palette.length)];
    const dim = 0.55 + rand() * 0.45;
    colors[i * 3] = c[0] * dim;
    colors[i * 3 + 1] = c[1] * dim;
    colors[i * 3 + 2] = c[2] * dim;
  }

  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  starGeo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));

  const starUniforms = { uTime: { value: 0 } };
  const stars = new THREE.Points(
    starGeo,
    new THREE.ShaderMaterial({
      uniforms: starUniforms,
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
    }),
  );
  stars.frustumCulled = false;

  const nebulaUniforms = { uTime: { value: 0 } };
  const nebula = new THREE.Mesh(
    new THREE.SphereGeometry(STAR_RADIUS * 1.15, 48, 48),
    new THREE.ShaderMaterial({
      uniforms: nebulaUniforms,
      vertexShader: NEBULA_VERT,
      fragmentShader: NEBULA_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  nebula.frustumCulled = false;

  return {
    objects: [nebula, stars],
    update(elapsedSec) {
      starUniforms.uTime.value = elapsedSec;
      nebulaUniforms.uTime.value = elapsedSec;
    },
  };
}
