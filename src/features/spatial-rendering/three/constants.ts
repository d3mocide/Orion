/** Scene scale: 1 world unit = 1000 km. SGP4 outputs km; multiply by this. */
export const KM_TO_UNITS = 1 / 1000;

export const EARTH_RADIUS_UNITS = 6.371;
export const MOON_RADIUS_UNITS = 1.7374;

/** Aurora palette — orbit regime → point color (also used by the UI legend) */
export const REGIME_COLORS: Record<string, [number, number, number]> = {
  LEO: [0.176, 0.831, 0.749], // #2dd4bf teal
  MEO: [0.655, 0.545, 0.98], // #a78bfa violet
  GEO: [0.957, 0.447, 0.714], // #f472b6 magenta
  HEO: [0.984, 0.749, 0.141], // #fbbf24 amber
};

export const REGIME_COLORS_CSS: Record<string, string> = {
  LEO: "#2dd4bf",
  MEO: "#a78bfa",
  GEO: "#f472b6",
  HEO: "#fbbf24",
};
