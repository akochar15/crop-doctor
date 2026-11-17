"use client";

// Coverage after each recalibration since the last reset, against the 90% promise (dashed). Plain SVG.
// The y axis starts at 80% unless a run fell lower (a lab-only reset drops to about 32%), so the line never leaves the chart.
import { useState } from "react";
import type { CalibrationRun } from "@/lib/api";

const W = 1000, H = 260, PAD = { l: 52, r: 16, t: 12, b: 34 };

export default function TrustChart({ runs }: { runs: CalibrationRun[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (runs.length === 0) return <p className="mt-4 text-ink-3">No recalibrations yet.</p>;
  const low = Math.min(0.8, Math.floor((Math.min(...runs.map((r) => r.monitor_coverage)) - 0.05) * 20) / 20);
  const lo = Math.max(0, low);
  const steps = 4;
  const ticks = Array.from({ length: steps + 1 }, (_, i) => 1 - (i * (1 - lo)) / steps);
  const x = (i: number) => PAD.l + (runs.length === 1 ? 0.5 : i / (runs.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((1 - v) / (1 - lo)) * (H - PAD.t - PAD.b);
  const line = runs.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.monitor_coverage).toFixed(1)}`).join(" ");
  const h = hover ?? runs.length - 1;
  const every = Math.max(1, Math.ceil(runs.length / 8));   // at most ~8 x labels

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" onMouseLeave={() => setHover(null)}
        aria-label={`Coverage after each recalibration: now ${Math.round(runs.at(-1)!.monitor_coverage * 100)}%, target 90%`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={PAD.l - 10} y={y(v) + 4} textAnchor="end" fontSize="13" fill="var(--ink-3)">{Math.round(v * 100)}%</text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0.9)} y2={y(0.9)} stroke="var(--ink-3)" strokeWidth="2" strokeDasharray="6 5" />
        <path d={line} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {runs.map((r, i) => (
          <g key={r.id}>
            <circle cx={x(i)} cy={y(r.monitor_coverage)} r={i === h ? 5.5 : 3.5} fill="var(--ink)" stroke="var(--surface)" strokeWidth="2" />
            <rect x={x(i) - 16} y={PAD.t} width="32" height={H - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => setHover(i)} />
            {(i % every === 0 || i === runs.length - 1) && (
              <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="13" fill="var(--ink-3)">{r.n_field_points}</text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-x-5 gap-y-1 text-sm text-ink-2">
        <span>Field labels in calibration</span>
        <span className="text-ink-3">
          {runs[h].note || "recalibration"}: coverage {(runs[h].monitor_coverage * 100).toFixed(1)}%, {runs[h].n_field_points} field labels
        </span>
      </figcaption>
    </figure>
  );
}
