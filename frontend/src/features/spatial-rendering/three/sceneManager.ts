/**
 * Owns the Three.js scene graph and WebGL pipeline. React mounts/unmounts it;
 * the render loop lives in OrionScene.tsx and calls `update()` each frame.
 *
 * World frame = z-up ECI (kilometers × KM_TO_UNITS). The Earth group rotates
 * by GMST so satellites can be written in raw SGP4 output coordinates.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import {
  gmstRad,
  sunEci,
  moonEci,
  geodeticToEcef,
  type GeodeticLocation,
} from "@/shared/utils/astro";
import { KM_TO_UNITS, EARTH_RADIUS_UNITS, MOON_RADIUS_UNITS } from "./constants";
import { createEarth, type EarthHandle } from "./earth";
import { createStarfield, type StarfieldHandle } from "./starfield";
import { createOrbitTrack, type OrbitTrackHandle } from "./orbitTrack";
import { initSatPoints, disposeSatPoints } from "./satPoints";

function makeGlowTexture(inner: string, outer: string): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.25, outer);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class OrionSceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly orbitTrack: OrbitTrackHandle;

  private composer: EffectComposer;
  private earth: EarthHandle;
  private starfield: StarfieldHandle;
  private sunLight: THREE.DirectionalLight;
  private sunSprite: THREE.Sprite;
  private moon: THREE.Mesh;
  private observerMarker: THREE.Group;
  private resizeObserver: ResizeObserver;
  private container: HTMLElement;
  private sunDirWorld = new THREE.Vector3(1, 0, 0);

  constructor(container: HTMLElement) {
    this.container = container;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#01020a");

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 6000);
    this.camera.up.set(0, 0, 1); // z-up ECI
    this.camera.position.set(-16, -22, 11);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = EARTH_RADIUS_UNITS * 1.15;
    this.controls.maxDistance = 500;
    this.controls.zoomSpeed = 1.4;

    // Earth (rotating ECEF group)
    const loader = new THREE.TextureLoader();
    this.earth = createEarth(loader);
    this.scene.add(this.earth.group);

    // Deep sky
    this.starfield = createStarfield();
    for (const obj of this.starfield.objects) this.scene.add(obj);

    // Sun: directional light + bloom-feeding glow sprite
    this.sunLight = new THREE.DirectionalLight(0xfff5e8, 2.2);
    this.scene.add(this.sunLight);
    this.scene.add(new THREE.AmbientLight(0x223344, 0.25));

    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture("rgba(255,252,240,1)", "rgba(255,220,150,0.45)"),
        transparent: true,
        depthWrite: false,
      }),
    );
    this.sunSprite.scale.setScalar(150);
    this.scene.add(this.sunSprite);

    // Moon: real scale, real(ish) ephemeris
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(MOON_RADIUS_UNITS, 48, 48),
      new THREE.MeshStandardMaterial({
        map: loader.load("/textures/moon_1024.jpg"),
        roughness: 0.95,
        metalness: 0,
      }),
    );
    this.moon.rotation.x = Math.PI / 2;
    this.scene.add(this.moon);

    // Observer ground-station marker (hidden until a location is set)
    this.observerMarker = this.buildObserverMarker();
    this.observerMarker.visible = false;
    this.earth.group.add(this.observerMarker);

    // Selected-satellite orbit track + pulsing marker
    this.orbitTrack = createOrbitTrack(this.scene);

    // Post-processing: bloom gives satellites / city lights / atmosphere their glow
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.45, 0.55, 0.8);
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());

    initSatPoints(this.scene);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
  }

  private buildObserverMarker(): THREE.Group {
    const group = new THREE.Group();
    const dot = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture("rgba(244,244,245,1)", "rgba(244,244,245,0.35)"),
        transparent: true,
        depthWrite: false,
      }),
    );
    dot.scale.setScalar(0.55);
    group.add(dot);
    return group;
  }

  /** Place (or hide) the ground-station marker. ECEF — parented to the Earth group. */
  setObserver(loc: GeodeticLocation | null): void {
    if (!loc) {
      this.observerMarker.visible = false;
      return;
    }
    const ecef = geodeticToEcef(loc);
    this.observerMarker.position.set(
      ecef.x * KM_TO_UNITS,
      ecef.y * KM_TO_UNITS,
      ecef.z * KM_TO_UNITS,
    );
    this.observerMarker.visible = true;
  }

  private handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
  }

  /** Per-frame update. jdUtc drives all astronomy; elapsed drives ambience. */
  update(jdUtc: number, dtSec: number, elapsedSec: number): void {
    // Earth spin (GMST) — this is what keeps ECI satellites honest
    this.earth.group.rotation.z = gmstRad(jdUtc);

    // Sun: place light + sprite along the real solar direction
    const sun = sunEci(jdUtc);
    this.sunDirWorld.set(sun.x, sun.y, sun.z).normalize();
    this.sunLight.position.copy(this.sunDirWorld).multiplyScalar(100);
    this.sunSprite.position.copy(this.sunDirWorld).multiplyScalar(2400);

    // Moon: truncated ephemeris, tidally locked-ish facing
    const moon = moonEci(jdUtc);
    this.moon.position.set(moon.x * KM_TO_UNITS, moon.y * KM_TO_UNITS, moon.z * KM_TO_UNITS);
    this.moon.rotation.y = Math.atan2(moon.y, moon.x) + Math.PI;

    this.earth.update(this.sunDirWorld, this.camera.position, dtSec);
    this.starfield.update(elapsedSec);
    this.orbitTrack.update(elapsedSec, this.camera.position.length());

    this.controls.update();
    this.composer.render();
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.orbitTrack.dispose();
    disposeSatPoints();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
