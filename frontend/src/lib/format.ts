export const fmtMW = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : v.toLocaleString("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const fmtGW = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : (v / 1000).toLocaleString("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const fmtSigned = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${fmtMW(v, digits)}`;

export const fmtPct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${v.toFixed(digits)}%`);

export const fmtGWh = (mwh: number | null | undefined, digits = 1) =>
  mwh == null ? "—" : `${(mwh / 1000).toLocaleString("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: digits })} GWh`;

/** "2026-01-15T18:00:00Z" -> "15 Jan 18:00" (UTC; equal to UK local time in January). */
export const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const day = d.getUTCDate();
  const mon = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${day} ${mon} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export const fmtDay = (isoDate: string) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};

/** Chart colours resolve through CSS variables so every chart follows the active theme. */
export const COLORS = {
  actual: "var(--c-actual)",
  forecast: "var(--c-forecast)",
  band: "var(--c-band)",
  risk: "var(--c-thermal)",
  shortfall: "var(--c-short)",
  thermal: "var(--c-thermal)",
  long: "var(--c-long)",
  muted: "var(--c-ink-3)",
  ink: "var(--c-ink)",
  rule: "var(--c-rule)",
  grid: "var(--c-grid)",
  hover: "var(--c-hover)",
  panel: "var(--c-panel)",
};

export const POSTURE_LABEL: Record<string, string> = {
  raw: "Raw forecast",
  bias: "Bias-corrected (median)",
  p90: "P90 conservative buffer",
  p95: "P95 stress buffer",
};

/** Clean y-axis ticks: 0 up to the next multiple of `step` above the data (5 GW steps by default). */
export function roundTicks(values: (number | null | undefined)[], step = 5000): number[] {
  const max = Math.max(step, ...values.filter((v): v is number => v != null));
  const top = Math.ceil((max * 1.04) / step) * step; // a little headroom so peaks never sit on the frame
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}
