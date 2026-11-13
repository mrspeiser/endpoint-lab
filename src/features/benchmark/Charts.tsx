import { formatRps, formatUs } from "../../lib/format";
import type { HistBar } from "../../types";

export function Histogram({ bars }: { bars: HistBar[] }) {
  if (bars.length === 0 || bars.every((bar) => bar.count === 0)) {
    return <p className="muted">Latency bars appear after the first completed requests.</p>;
  }
  const max = Math.max(...bars.map((bar) => bar.count), 1);
  const width = bars.length * 44;
  return (
    <svg className="histogram" viewBox={`0 0 ${width} 132`} role="img" aria-label="Latency distribution">
      {bars.map((bar, index) => {
        const height = (bar.count / max) * 92;
        const label = index === bars.length - 1 ? "more" : formatUs(bar.leUs);
        return (
          <g key={`${bar.leUs}-${index}`}>
            <rect x={index * 44 + 8} y={100 - height} width={28} height={Math.max(height, bar.count > 0 ? 2 : 0)} rx="2" />
            <text x={index * 44 + 22} y={118} textAnchor="middle">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Sparkline({ points }: { points: Array<{ t: number; rps: number }> }) {
  if (points.length < 2) {
    return <p className="muted">Throughput is sampled a few times a second, not once per request.</p>;
  }
  const max = Math.max(...points.map((point) => point.rps), 1);
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 36 - (point.rps / max) * 32;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <div className="spark-wrap">
      <svg className="spark" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Requests per second">
        <path d={path} />
      </svg>
      <span>{formatRps(points[points.length - 1]?.rps ?? 0)} rps</span>
    </div>
  );
}
