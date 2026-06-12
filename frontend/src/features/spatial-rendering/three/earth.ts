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
  uniform sampler2D uNormalMap;
  uniform sampler2D uCloudMap;
  uniform float uCloudDrift;  // cloud-layer rotation, in uv.x turns
  uniform vec3 uSunDir;       // world-space, normalized
  uniform vec3 uCameraPos;    // world-space

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vec3 geoNormal = normalize(vWorldNormal);
    vec3 viewDir = normalize(uCameraPos - vWorldPos);

    // Tangent frame for the normal map: the Earth group spins about world +Z,
    // so the polar axis is constant in world space; east = axis × normal.
    // (epsilon keeps the frame finite at the exact poles)
    vec3 tangent = normalize(cross(vec3(0.0, 0.0, 1.0), geoNormal) + vec3(1e-5, 0.0, 0.0));
    vec3 bitangent = cross(geoNormal, tangent);
    vec3 nm = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
    const float reliefScale = 0.85;
    vec3 normal = normalize(
      tangent * nm.x * reliefScale + bitangent * nm.y * reliefScale + geoNormal * max(nm.z, 0.35)
    );

    // Day/night follows the geometric normal (the terminator is planetary);
    // terrain relief modulates brightness within the lit side.
    float sunCos = dot(geoNormal, uSunDir);
    float dayWeight = smoothstep(-0.12, 0.18, sunCos);
    float relief = clamp(dot(normal, uSunDir), 0.0, 1.0);

    vec3 day = texture2D(uDayMap, vUv).rgb;
    vec3 nightTex = texture2D(uNightMap, vUv).rgb;

    // City lights: warm amber boost, bright enough to feed the bloom pass
    vec3 cityLights = nightTex * vec3(1.6, 1.25, 0.85) * 1.7;
    vec3 nightSide = cityLights + vec3(0.012, 0.016, 0.035);

    vec3 litDay = day * (0.25 + 0.95 * dayWeight) * (0.72 + 0.28 * relief);

    // Cloud shadows: re-sample the drifting cloud layer where it sits now
    float cloudShadow = texture2D(uCloudMap, vec2(fract(vUv.x - uCloudDrift), vUv.y)).r;
    litDay *= 1.0 - cloudShadow * 0.30 * dayWeight;

    vec3 color = mix(nightSide, litDay, dayWeight);

    // Ocean specular (spec map: bright = water): a tight sun glitter plus a
    // broad sheen, both broken up by the coastline relief in the normal map
    float specMask = texture2D(uSpecMap, vUv).r;
    vec3 halfVec = normalize(uSunDir + viewDir);
    float specCos = max(dot(normal, halfVec), 0.0);
    float glint = pow(specCos, 140.0) * 0.9;
    float sheen = pow(specCos, 16.0) * 0.16;
    color += (vec3(1.0, 0.96, 0.86) * glint + vec3(0.45, 0.5, 0.55) * sheen)
           * specMask * dayWeight;

    // Aurora limb glow: teal→violet fresnel, strongest along the terminator
    float fresnel = pow(1.0 - max(dot(viewDir, geoNormal), 0.0), 2.6);
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

type TextureUniform = { value: THREE.Texture };

/**
 * Progressive texture upgrade: bind the small map immediately so first paint
 * is fast, then swap in the high-resolution version once it arrives. The 8K
 * day/night and 4K cloud/normal/specular maps are Solar System Scope assets
 * (CC BY 4.0), derived from NASA Blue Marble imagery.
 */
function loadProgressive(
  loader: THREE.TextureLoader,
  uniforms: TextureUniform[],
  lowUrl: string,
  highUrl: string,
  configure: (tex: THREE.Texture) => void,
): void {
  const low = loader.load(lowUrl, configure);
  configure(low);
  for (const u of uniforms) u.value = low;
  loader.load(highUrl, (high) => {
    configure(high);
    for (const u of uniforms) u.value = high;
    low.dispose();
  });
}

export function createEarth(textureLoader: THREE.TextureLoader, maxAnisotropy = 8): EarthHandle {
  const group = new THREE.Group();

  const srgb = (tex: THREE.Texture) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
  };
  const linear = (tex: THREE.Texture) => {
    tex.anisotropy = maxAnisotropy;
  };
  // The earth shader re-samples clouds with a longitude offset (drifting
  // shadows), so the map must wrap horizontally across the dateline seam
  const cloudCfg = (tex: THREE.Texture) => {
    tex.anisotropy = maxAnisotropy;
    tex.wrapS = THREE.RepeatWrapping;
  };

  const placeholder = new THREE.Texture();

  const earthUniforms = {
    uDayMap: { value: placeholder },
    uNightMap: { value: placeholder },
    uSpecMap: { value: placeholder },
    uNormalMap: { value: placeholder },
    uCloudMap: { value: placeholder },
    uCloudDrift: { value: 0 },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uCameraPos: { value: new THREE.Vector3() },
  };
  const cloudUniforms = {
    uCloudMap: { value: placeholder },
    uSunDir: { value: earthUniforms.uSunDir.value },
  };

  loadProgressive(
    textureLoader,
    [earthUniforms.uDayMap],
    "/textures/earth_atmos_2048.jpg",
    "/textures/earth_day_8k.jpg",
    srgb,
  );
  loadProgressive(
    textureLoader,
    [earthUniforms.uNightMap],
    "/textures/earth_lights_2048.png",
    "/textures/earth_night_8k.jpg",
    srgb,
  );
  loadProgressive(
    textureLoader,
    [earthUniforms.uSpecMap],
    "/textures/earth_specular_2048.jpg",
    "/textures/earth_specular_4k.jpg",
    linear,
  );
  loadProgressive(
    textureLoader,
    [earthUniforms.uNormalMap],
    "/textures/earth_normal_2048.jpg",
    "/textures/earth_normal_4k.jpg",
    linear,
  );
  loadProgressive(
    textureLoader,
    [earthUniforms.uCloudMap, cloudUniforms.uCloudMap],
    "/textures/earth_clouds_1024.png",
    "/textures/earth_clouds_4k.jpg",
    cloudCfg,
  );

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS_UNITS, 160, 160),
    new THREE.ShaderMaterial({
      uniforms: earthUniforms,
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    }),
  );
  earth.rotation.x = Math.PI / 2; // poles → +Z
  group.add(earth);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS_UNITS * 1.004, 96, 96),
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
    new THREE.SphereGeometry(EARTH_RADIUS_UNITS * 1.045, 96, 96),
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

  let cloudDriftRad = 0;
  return {
    group,
    update(sunDirWorld, cameraPos, dtSec) {
      earthUniforms.uSunDir.value.copy(sunDirWorld);
      earthUniforms.uCameraPos.value.copy(cameraPos);
      // Slow westward cloud drift relative to the surface; the earth shader
      // tracks the same angle so cloud shadows stay under their clouds
      cloudDriftRad += dtSec * 0.004;
      clouds.rotation.y = cloudDriftRad;
      earthUniforms.uCloudDrift.value = cloudDriftRad / (2 * Math.PI);
    },
  };
}
