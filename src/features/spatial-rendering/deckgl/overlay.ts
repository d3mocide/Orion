import { Deck, GlobeView } from "@deck.gl/core";
import { LineLayer } from "@deck.gl/layers";
import * as Cesium from "cesium";
import { buildOrbitSegments, type TrackSegment } from "./layers/orbitTrackLayer";

export interface DeckOverlayHandle {
  destroy(): void;
  updateOrbitTrack(positions: Float64Array | null, jdStart: number, stepSec: number): void;
  syncCamera(camera: Cesium.Camera): void;
}

export function createDeckOverlay(container: HTMLElement): DeckOverlayHandle {
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;";
  container.appendChild(canvas);

  let segments: TrackSegment[] = [];

  const deck = new Deck({
    canvas,
    views: new GlobeView({ id: "globe" }),
    viewState: { longitude: 0, latitude: 0, zoom: 0, pitch: 0, bearing: 0 } as Record<
      string,
      unknown
    >,
    controller: false,
    layers: [],
    glOptions: { alpha: true } as WebGLContextAttributes,
    useDevicePixels: true,
  });

  const observer = new ResizeObserver(() => {
    deck.setProps({});
  });
  observer.observe(container);

  function redraw() {
    deck.setProps({
      layers:
        segments.length > 0
          ? [
              new LineLayer<TrackSegment>({
                id: "orbit-track",
                data: segments,
                getSourcePosition: (d) => d.source,
                getTargetPosition: (d) => d.target,
                getColor: [100, 200, 255, 180],
                getWidth: 1,
                widthMinPixels: 1,
              }),
            ]
          : [],
    });
  }

  return {
    destroy() {
      observer.disconnect();
      deck.finalize();
      canvas.remove();
    },

    updateOrbitTrack(positions, jdStart, stepSec) {
      segments = positions ? buildOrbitSegments(positions, jdStart, stepSec) : [];
      redraw();
    },

    syncCamera(camera) {
      const carto = camera.positionCartographic;
      const altitude = Math.max(1, carto.height);
      // Approximate zoom: at ~6371km altitude, zoom ≈ 2; halves per doubling of altitude
      const zoom = Math.max(0, Math.log2(6_371_000 / altitude) + 2);
      deck.setProps({
        viewState: {
          longitude: Cesium.Math.toDegrees(carto.longitude),
          latitude: Cesium.Math.toDegrees(carto.latitude),
          zoom,
          bearing: Cesium.Math.toDegrees(camera.heading),
          pitch: Math.max(0, Cesium.Math.toDegrees(camera.pitch) + 90),
        } as Record<string, unknown>,
      });
    },
  };
}
