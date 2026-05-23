import type { OMMRecord } from "@/shared/types/omm";
import type { OrbitRegime } from "@/shared/store/filters.store";

const MU_KM3_S2 = 398_600.4418;
const R_EARTH_KM = 6_371.0;

/** Classify orbit regime from OMM mean motion and eccentricity. */
export function classifyOrbitRegime(record: OMMRecord): OrbitRegime {
  const n_rad_s = (record.MEAN_MOTION * 2 * Math.PI) / 86_400;
  const a = Math.cbrt(MU_KM3_S2 / (n_rad_s * n_rad_s)); // semi-major axis km
  const apogee = a * (1 + record.ECCENTRICITY) - R_EARTH_KM;
  const perigee = a * (1 - record.ECCENTRICITY) - R_EARTH_KM;
  const meanAlt = (apogee + perigee) / 2;

  if (record.ECCENTRICITY > 0.25 && apogee > 35_786) return "HEO";
  if (meanAlt >= 34_786 && meanAlt <= 36_786) return "GEO";
  if (meanAlt >= 2_000) return "MEO";
  return "LEO";
}
