import * as Cesium from "cesium";

/** Fly camera to a satellite's current ECI position (km → m). */
export function flyToSatellite(
  viewer: Cesium.Viewer,
  eciX: number,
  eciY: number,
  eciZ: number,
): void {
  const positionEcef = new Cesium.Cartesian3(eciX * 1000, eciY * 1000, eciZ * 1000);
  viewer.camera.flyTo({
    destination: positionEcef,
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-45),
      roll: 0,
    },
    duration: 1.5,
  });
}

/** Reset camera to home (whole-Earth) view. */
export function resetCamera(viewer: Cesium.Viewer): void {
  viewer.camera.flyHome(1.0);
}
