import type { DopplerPoint } from "@/features/ground-station/passPrediction";

interface DopplerChartProps {
  doppler: DopplerPoint[];
  /** Current sim time, for the live marker */
  nowJd: number;
}

const W = 280;
const H = 110;
const PAD_L = 6;
const PAD_R = 6;
const PAD_Y = 12;

export function DopplerChart({ doppler, nowJd }: DopplerChartProps) {
  if (doppler.length < 2) return null;

  const jd0 = doppler[0].jd;
  const jd1 = doppler[doppler.length - 1].jd;
  const maxAbs = Math.max(...doppler.map((d) => Math.abs(d.shiftHz)), 1);

  const x = (jd: number) => PAD_L + ((jd - jd0) / (jd1 - jd0)) * (W - PAD_L - PAD_R);
  const y = (hz: number) => H / 2 - (hz / maxAbs) * (H / 2 - PAD_Y);

  const path = doppler
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(d.jd).toFixed(1)},${y(d.shiftHz).toFixed(1)}`)
    .join(" ");

  const live = nowJd >= jd0 && nowJd <= jd1;
  // Nearest sample to "now" for the live marker
  let liveIdx = 0;
  if (live) {
    let best = Infinity;
    doppler.forEach((d, i) => {
      const e = Math.abs(d.jd - nowJd);
      if (e < best) {
        best = e;
        liveIdx = i;
      }
    });
  }

  const durSec = Math.round((jd1 - jd0) * 86_400);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Doppler shift curve">
      {/* Zero line */}
      <line x1={PAD_L} y1={H / 2} x2={W - PAD_R} y2={H / 2} stroke="rgba(255,255,255,0.12)" />
      {/* Envelope labels */}
      <text
        x={PAD_L}
        y={10}
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
        className="fill-zinc-500"
      >
        +{maxAbs.toFixed(0)} Hz
      </text>
      <text
        x={PAD_L}
        y={H - 3}
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
        className="fill-zinc-500"
      >
        −{maxAbs.toFixed(0)} Hz
      </text>
      <text
        x={W - PAD_R}
        y={H - 3}
        textAnchor="end"
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
        className="fill-zinc-600"
      >
        {durSec}s
      </text>

      <path d={path} fill="none" stroke="#4ade80" strokeWidth="1.5" />

      {live && (
        <circle
          cx={x(doppler[liveIdx].jd)}
          cy={y(doppler[liveIdx].shiftHz)}
          r="3.5"
          fill="#e8b44a"
        />
      )}
    </svg>
  );
}
