import type { TrackPoint } from "@/features/ground-station/passPrediction";

interface PolarPlotProps {
  /** Look-angle samples for one pass (only el ≥ 0 points are drawn) */
  track: TrackPoint[];
  /** Live satellite position, drawn as a dot when above the horizon */
  liveAzDeg: number | null;
  liveElDeg: number | null;
}

const SIZE = 220;
const C = SIZE / 2;
const R = C - 18;

/** Azimuth/elevation → SVG coords. North up, east right, zenith at center. */
function project(azDeg: number, elDeg: number): { x: number; y: number } {
  const r = (R * (90 - Math.max(elDeg, 0))) / 90;
  const az = (azDeg * Math.PI) / 180;
  return { x: C + r * Math.sin(az), y: C - r * Math.cos(az) };
}

export function PolarPlot({ track, liveAzDeg, liveElDeg }: PolarPlotProps) {
  const visible = track.filter((p) => p.elDeg >= 0);
  const path = visible
    .map((p, i) => {
      const { x, y } = project(p.azDeg, p.elDeg);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const aos = visible[0];
  const los = visible[visible.length - 1];
  const live =
    liveAzDeg !== null && liveElDeg !== null && liveElDeg >= 0
      ? project(liveAzDeg, liveElDeg)
      : null;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="w-full"
      role="img"
      aria-label="Polar tracking plot"
    >
      {/* Elevation rings: 0° / 30° / 60° */}
      {[0, 30, 60].map((el) => (
        <circle
          key={el}
          cx={C}
          cy={C}
          r={(R * (90 - el)) / 90}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1"
        />
      ))}
      {/* Crosshair */}
      <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="rgba(255,255,255,0.08)" />
      <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="rgba(255,255,255,0.08)" />
      {/* Cardinal labels */}
      {(
        [
          ["N", C, C - R - 6],
          ["S", C, C + R + 12],
          ["E", C + R + 8, C + 4],
          ["W", C - R - 8, C + 4],
        ] as const
      ).map(([t, x, y]) => (
        <text
          key={t}
          x={x}
          y={y}
          textAnchor="middle"
          className="fill-zinc-500"
          fontSize="10"
          fontFamily="JetBrains Mono, monospace"
        >
          {t}
        </text>
      ))}

      {/* Pass trajectory */}
      {path && <path d={path} fill="none" stroke="rgba(232,180,74,0.9)" strokeWidth="1.6" />}

      {/* AOS / LOS endpoints */}
      {aos && (
        <circle
          cx={project(aos.azDeg, aos.elDeg).x}
          cy={project(aos.azDeg, aos.elDeg).y}
          r="3"
          fill="none"
          stroke="#4ade80"
        />
      )}
      {los && (
        <rect
          x={project(los.azDeg, los.elDeg).x - 2.5}
          y={project(los.azDeg, los.elDeg).y - 2.5}
          width="5"
          height="5"
          fill="none"
          stroke="rgba(255,255,255,0.5)"
        />
      )}

      {/* Live position */}
      {live && <circle cx={live.x} cy={live.y} r="4" fill="#4ade80" />}
    </svg>
  );
}
