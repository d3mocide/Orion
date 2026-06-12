/**
 * Earth assembly: day/night shader globe, drifting cloud layer, and an
 * aurora-tinted atmosphere shell. Returned group lives in the rotating
 * ECEF frame — the scene manager sets `group.rotation.z = GMST` each frame.
 *
 * World frame is z-up ECI (camera.up = +Z). SphereGeometry poles are along
 * local +Y, so each sphere is pre-rotated +90° about X to put its poles on Z.
 * After that rotation, texture u=0.5 (Greenwich on equirectangular maps)
 * faces local +X — which is exactly ECEF +X, so no longitude offset is needed.
 */

import * as THREE from "three";
import { EARTH_RADIUS_UNITS } from "./constants";

const EARTH_VERT = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D uDayMap;
  uniform sampler2D uNightMap;
  uniform sampler2D uSpecMap;
  uniform vec3 uSunDir;       // world-space, normalized
  uniform vec3 uCameraPos;    // world-space

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(uCameraPos - vWorldPos);

    float sunCos = dot(normal, uSunDir);
    float dayWeight = smoothstep(-0.12, 0.18, sunCos);

    vec3 day = texture2D(uDayMap, vUv).rgb;
    vec3 nightTex = texture2D(uNightMap, vUv).rgb;

    // City lights: warm amber boost, bright enough to feed the bloom pass
    vec3 cityLights = nightTex * vec3(1.6, 1.25, 0.85) * 1.7;
    vec3 nightSide = cityLights + vec3(0.012, 0.016, 0.035);

    vec3 color = mix(nightSide, day * (0.25 + 0.95 * dayWeight), dayWeight);

    // Ocean specular glint (spec map: bright = water)
    float specMask = texture2D(uSpecMap, vUv).r;
    vec3 halfVec = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 24.0) * specMask * dayWeight;
    color += vec3(0.45, 0.5, 0.55) * spec;

    // Aurora limb glow: teal→violet fresnel, strongest along the terminator
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.6);
    float terminator = 1.0 - abs(sunCos);
    vec3 rim = mix(vec3(0.18, 0.83, 0.75), vec3(0.55, 0.36, 0.96), terminator);
    color += rim * fresnel * 0.55;

    gl_FragColor = vec4(color, 1.0);
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uCameraPos;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    // Rendered on the back side: normals face away from the camera
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(uCameraPos - vWorldPos);

    float rim = pow(1.0 - abs(dot(viewDir, normal)), 3.2);
    float sunlit = 0.35 + 0.65 * smoothstep(-0.4, 0.6, dot(normal, uSunDir));

    // Aurora gradient: teal at the limb core, violet feathering outward
    vec3 inner = vec3(0.16, 0.86, 0.80);
    vec3 outer = vec3(0.62, 0.40, 0.98);
    vec3 color = mix(inner, outer, rim);

    gl_FragColor = vec4(color, rim * sunlit * 0.9);
  }
`;

export interface EarthHandle {
  /** Rotating ECEF group — set rotation.z = GMST; parent observer markers here */
  group: THREE.Group;
  /** Per-frame uniform updates */
  update: (sunDirWorld: THREE.Vector3, cameraPos: THREE.Vector3, dtSec: number) => void;
}

export function createEarth(textureLoader: THREE.TextureLoader): EarthHandle {
  const group = new THREE.Group();

  const dayMap = textureLoader.load("/textures/earth_atmos_2048.jpg");
  const nightMap = textureLoader.load("/textures/earth_lights_2048.png");
  const specMap = textureLoader.load("/textures/earth_specular_2048.jpg");
  const cloudsMap = textureLoader.load("/textures/earth_clouds_1024.png");
  dayMap.colorSpace = THREE.SRGBColorSpace;
  nightMap.colorSpace = THREE.SRGBColorSpace;
  dayMap.anisotropy = 8;
  nightMap.anisotropy = 8;

  const earthUniforms = {
    uDayMap: { value: dayMap },
    uNightMap: { value: nightMap },
    uSpecMap: { value: specMap },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uCameraPos: { value: new THREE.Vector3() },
  };

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS_UNITS, 96, 96),
    new THREE.ShaderMaterial({
      uniforms: earthUniforms,
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    }),
  );
  earth.rotation.x = Math.PI / 2; // poles → +Z
  group.add(earth);

  const cloudUniforms = {
    uCloudMap: { value: cloudsMap },
    uSunDir: { value: earthUniforms.uSunDir.value },
  };
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS_UNITS * 1.004, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: cloudUniforms,
      vertexShader: EARTH_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D uCloudMap;
        uniform vec3 uSunDir;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        varying vec2 vUv;
        void main() {
          float cloud = texture2D(uCloudMap, vUv).r;
          float lit = 0.12 + 0.88 * smoothstep(-0.15, 0.3, dot(normalize(vWorldNormal), uSunDir));
          gl_FragColor = vec4(vec3(0.9, 0.93, 1.0) * lit, cloud * 0.42);
        }
      `,
      transparent: true,
      depthWrite: false,
    }),
  );
  clouds.rotation.x = Math.PI / 2;
  group.add(clouds);

  const atmoUniforms = {
    uSunDir: { value: earthUniforms.uSunDir.value },
    uCameraPos: { value: earthUniforms.uCameraPos.value },
  };
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS_UNITS * 1.045, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: atmoUniforms,
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  // Atmosphere is a screen-space rim effect — it must not rotate with ECEF,
  // but parenting it here is harmless since the shell is rotationally symmetric.
  group.add(atmosphere);

  return {
    group,
    update(sunDirWorld, cameraPos, dtSec) {
      earthUniforms.uSunDir.value.copy(sunDirWorld);
      earthUniforms.uCameraPos.value.copy(cameraPos);
      // Slow westward cloud drift relative to the surface
      clouds.rotation.y += dtSec * 0.004;
    },
  };
}
