/** 12+ point trend in the de-emphasis ink with the latest value marked; inline SVG so it costs no layout. */
export function Sparkline({ values, color = "var(--c-ink-3)", zero = false, label }: { values: (number | null)[]; color?: string; zero?: boolean; label: string }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return null;
  const W = 96;
  const H = 26;
  const ys = pts.map((p) => p[1]).concat(zero ? [0] : []);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const x = (i: number) => 1 + (i / (values.length - 1)) * (W - 6);
  const y = (v: number) => 3 + (1 - (v - min) / (max - min || 1)) * (H - 6);
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const [li, lv] = pts[pts.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="overflow-visible">
      {zero && min < 0 && max > 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--c-rule)" strokeWidth={1} />}
      <path d={d} fill="none" stroke="var(--c-ink-3)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.7} />
      <circle cx={x(li)} cy={y(lv)} r={2.75} fill={color} stroke="var(--c-panel)" strokeWidth={1.5} />
    </svg>
  );
}
