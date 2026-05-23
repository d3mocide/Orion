import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  initPointPrimitivePool,
  updatePointPositions,
  getNoradIds,
  getEciAtIndex,
} from "./pointPrimitivePool";
import { createDeckOverlay, type DeckOverlayHandle } from "../deckgl/overlay";
import { useUIStore } from "@/shared/store/ui.store";
import { useSelectionStore } from "@/shared/store/selection.store";
import type { PropagatorAPI, SatelliteMetadata } from "@/features/orbital-mechanics/types";

const MU_KM3_S2 = 398_600.4418; // Earth gravitational parameter

interface CesiumGlobeProps {
  propagator: PropagatorAPI | null;
}

interface TooltipState {
  x: number;
  y: number;
  noradId: string;
  name: string;
  altKm: number;
  velKms: number;
}

/** Full-bleed Cesium globe. Owns the render loop and PointPrimitiveCollection.
 *  Never uses the Entity API. React is responsible only for mounting/unmounting. */
export function CesiumGlobe({ propagator }: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const rafRef = useRef<number | null>(null);
  const posBufferRef = useRef<Float64Array | null>(null);
  const overlayRef = useRef<DeckOverlayHandle | null>(null);
  const propagatorRef = useRef<PropagatorAPI | null>(null);
  const metaCacheRef = useRef<Map<string, SatelliteMetadata>>(new Map());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Keep propagatorRef in sync so the hover closure always has the latest propagator
  propagatorRef.current = propagator;

  const setFps = useUIStore((s) => s.setFps);
  const simTimeJd = useUIStore((s) => s.simTimeJd);
  const select = useSelectionStore((s) => s.select);
  const selectedId = useSelectionStore((s) => s.selectedNoradId);

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

    // deck.gl overlay for orbit track (canvas appended inside container)
    const overlay = createDeckOverlay(containerRef.current);
    overlayRef.current = overlay;

    // Debounced hover picking
    let pickTimer: ReturnType<typeof setTimeout> | null = null;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
      if (pickTimer) clearTimeout(pickTimer);
      pickTimer = setTimeout(() => {
        const picked = viewer.scene.pick(movement.endPosition);
        if (picked?.id && typeof picked.id === "string") {
          const noradId = picked.id;
          useSelectionStore.getState().hover(noradId);

          // Altitude + velocity from last propagation buffer
          let altKm = 0;
          let velKms = 0;
          const buf = posBufferRef.current;
          if (buf) {
            const idx = getNoradIds().indexOf(noradId);
            if (idx >= 0) {
              const eci = getEciAtIndex(buf, idx);
              if (eci) {
                const r = Math.sqrt(eci.x * eci.x + eci.y * eci.y + eci.z * eci.z);
                altKm = r - 6371;
                velKms = Math.sqrt(MU_KM3_S2 / r); // circular orbit approx
              }
            }
          }

          const cached = metaCacheRef.current.get(noradId);
          setTooltip({
            x: movement.endPosition.x,
            y: movement.endPosition.y,
            noradId,
            name: cached?.name ?? noradId,
            altKm,
            velKms,
          });

          // Fetch metadata if not cached
          const prop = propagatorRef.current;
          if (!cached && prop) {
            void prop.getMetadata(noradId).then((meta) => {
              if (!meta) return;
              metaCacheRef.current.set(noradId, meta);
              setTooltip((prev) => {
                if (!prev || prev.noradId !== noradId) return prev;
                return { ...prev, name: meta.name };
              });
            });
          }
        } else {
          useSelectionStore.getState().hover(null);
          setTooltip(null);
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
      overlay.destroy();
      overlayRef.current = null;
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [select]);

  // Orbit track — refetch whenever selection changes
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    if (!selectedId || !propagator) {
      overlay.updateOrbitTrack(null, 0, 0);
      return;
    }

    let cancelled = false;
    const prop = propagator;
    const jdStart = useUIStore.getState().simTimeJd;
    const jdEnd = jdStart + 90 / 1440; // 90-minute forward track

    void prop.propagateRange(selectedId, jdStart, jdEnd, 30).then((buf) => {
      if (cancelled) return;
      overlay.updateOrbitTrack(new Float64Array(buf), jdStart, 30);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedId, propagator]);

  // Render loop — runs outside React reconciliation
  useEffect(() => {
    if (!viewerRef.current || !propagator) return;

    const viewer = viewerRef.current;
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

      if (!useUIStore.getState().simPaused) {
        simJd += (wallDeltaSec * useUIStore.getState().simSpeed) / 86400;
        useUIStore.getState().setSimTimeJd(simJd);
      } else {
        simJd = useUIStore.getState().simTimeJd;
      }

      try {
        const buf = await prop.propagateAt(simJd);
        const positions = new Float64Array(buf);
        posBufferRef.current = positions;
        updatePointPositions(positions, simJd);
      } catch {
        // Worker not ready yet — skip frame
      }

      // Sync deck.gl camera with Cesium camera
      overlayRef.current?.syncCamera(viewer.camera);

      viewer.scene.requestRender();

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

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      {tooltip && (
        <div
          style={{ left: tooltip.x + 14, top: tooltip.y - 30 }}
          className="absolute z-50 pointer-events-none bg-slate-900/90 backdrop-blur-sm border border-slate-600 rounded px-2 py-1.5 text-xs"
        >
          <div className="font-mono text-space-accent text-[10px]">{tooltip.noradId}</div>
          <div className="text-slate-200 font-medium">{tooltip.name}</div>
          <div className="text-slate-400 mt-0.5">
            Alt: <span className="text-slate-300">{tooltip.altKm.toFixed(0)} km</span>
          </div>
          <div className="text-slate-400">
            Vel: <span className="text-slate-300">~{tooltip.velKms.toFixed(2)} km/s</span>
          </div>
        </div>
      )}
    </>
  );
}
