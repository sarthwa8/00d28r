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

export const COLORS = {
  actual: "#0F9D8A",
  forecast: "#4D63D9",
  band: "#4D63D9",
  risk: "#E08A00",
  shortfall: "#D6453D",
  thermal: "#E08A00",
  long: "#2F7FC1",
  muted: "#7B8BA1",
  ink: "#13233A",
  violet: "#8B5CF6",
};

export const POSTURE_LABEL: Record<string, string> = {
  raw: "Raw forecast",
  bias: "Bias-corrected (median)",
  p90: "P90 conservative buffer",
  p95: "P95 stress buffer",
};
