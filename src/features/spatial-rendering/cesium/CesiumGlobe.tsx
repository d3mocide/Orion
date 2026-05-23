import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { initPointPrimitivePool, updatePointPositions } from "./pointPrimitivePool";
import { useUIStore } from "@/shared/store/ui.store";
import { useSelectionStore } from "@/shared/store/selection.store";
import type { PropagatorAPI } from "@/features/orbital-mechanics/types";

interface CesiumGlobeProps {
  propagator: PropagatorAPI | null;
}

/** Full-bleed Cesium globe. Owns the render loop and PointPrimitiveCollection.
 *  Never uses the Entity API. React is responsible only for mounting/unmounting. */
export function CesiumGlobe({ propagator }: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const rafRef = useRef<number | null>(null);
  const posBufferRef = useRef<Float64Array | null>(null);

  const setFps = useUIStore((s) => s.setFps);
  const simTimeJd = useUIStore((s) => s.simTimeJd);
  const simPaused = useUIStore((s) => s.simPaused);
  const select = useSelectionStore((s) => s.select);

  // Mount Cesium viewer once
  useEffect(() => {
    if (!containerRef.current) return;

    Cesium.Ion.defaultAccessToken = import.meta.env["VITE_CESIUM_ION_TOKEN"] ?? "";

    const viewer = new Cesium.Viewer(containerRef.current, {
      infoBox: false,
      selectionIndicator: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
    });

    // Use NaturalEarthII basemap when no Ion token is set
    if (!Cesium.Ion.defaultAccessToken) {
      viewer.imageryLayers.removeAll();
      void Cesium.TileMapServiceImageryProvider.fromUrl(
        Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
      ).then((provider) => {
        viewer.imageryLayers.addImageryProvider(provider);
      });
    }

    viewer.scene.globe.enableLighting = true;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0a0e1a");

    viewerRef.current = viewer;

    // Picking: debounced hover
    let pickTimer: ReturnType<typeof setTimeout> | null = null;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
      if (pickTimer) clearTimeout(pickTimer);
      pickTimer = setTimeout(() => {
        const picked = viewer.scene.pick(movement.endPosition);
        if (picked?.id && typeof picked.id === "string") {
          useSelectionStore.getState().hover(picked.id);
        } else {
          useSelectionStore.getState().hover(null);
        }
      }, 60);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(click.position);
      if (picked?.id && typeof picked.id === "string") {
        select(picked.id);
      } else {
        select(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [select]);

  // Render loop — runs outside React reconciliation
  useEffect(() => {
    if (!viewerRef.current || !propagator) return;

    const viewer = viewerRef.current;
    // Capture non-null reference for use inside async frame closure
    const prop = propagator;
    initPointPrimitivePool(viewer.scene.primitives);

    let lastFpsUpdate = performance.now();
    let frameCount = 0;
    let simJd = simTimeJd;
    let lastFrameTime = performance.now();
    let cancelled = false;

    async function frame() {
      if (cancelled) return;

      const now = performance.now();
      const wallDeltaSec = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      // Advance sim time
      if (!simPaused) {
        const speed = useUIStore.getState().simSpeed;
        simJd += (wallDeltaSec * speed) / 86400;
        useUIStore.getState().setSimTimeJd(simJd);
      } else {
        simJd = useUIStore.getState().simTimeJd;
      }

      // Propagate — buffer transferred from worker (zero-copy)
      try {
        const buf = await prop.propagateAt(simJd);
        const positions = new Float64Array(buf);
        posBufferRef.current = positions;
        updatePointPositions(positions);
      } catch {
        // Worker not ready yet — skip frame
      }

      viewer.scene.requestRender();

      // FPS counter update every second
      frameCount++;
      if (now - lastFpsUpdate >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastFpsUpdate)));
        frameCount = 0;
        lastFpsUpdate = now;
      }

      rafRef.current = requestAnimationFrame(() => void frame());
    }

    rafRef.current = requestAnimationFrame(() => void frame());

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propagator, setFps]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
