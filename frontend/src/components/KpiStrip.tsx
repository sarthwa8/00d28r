import type { Kpis } from "../types/api";
import { fmtMW, fmtPct, fmtSigned, fmtTime } from "../lib/format";

interface Cell {
  label: string;
  value: string;
  unit?: string;
  meaning: string;
  formula: string;
  tone?: string;
}

/** One instrument panel of error metrics; each cell states what the number means and how it is computed. */
export function KpiStrip({ kpis, compact = false }: { kpis: Kpis; compact?: boolean }) {
  const cells: Cell[] = [
    { label: "Typical miss (MAE)", value: fmtMW(kpis.mae_mw), unit: "MW", meaning: `${fmtPct(kpis.nmae_pct)} of peak wind`, formula: "mean |forecast − actual|" },
    { label: "RMSE", value: fmtMW(kpis.rmse_mw), unit: "MW", meaning: "Weights big misses more", formula: "√ mean (forecast − actual)²" },
    {
      label: "Bias",
      value: fmtSigned(kpis.mbe_mw),
      unit: "MW",
      meaning: `Too high in ${fmtPct(kpis.shortfall_period_pct, 0)} of periods`,
      formula: "mean (forecast − actual); positive means wind under-delivers",
      tone: "text-short",
    },
    { label: "MAPE", value: fmtPct(kpis.mape_pct), meaning: "Relative to actual output", formula: "mean |e| / max(actual, 100 MW)" },
    {
      label: "P90 shortfall cover",
      value: fmtMW(kpis.p90_shortfall_buffer_mw),
      unit: "MW",
      meaning: "Covers 9 in 10 periods",
      formula: "max(0, 90th percentile of forecast − actual)",
      tone: "text-thermal",
    },
    {
      label: "P95 shortfall cover",
      value: fmtMW(kpis.p95_shortfall_buffer_mw),
      unit: "MW",
      meaning: "Covers 19 in 20 periods",
      formula: "max(0, 95th percentile of forecast − actual)",
      tone: "text-thermal",
    },
  ];
  if (!compact) {
    cells.push(
      { label: "Worst shortfall", value: fmtMW(kpis.max_overforecast_mw), unit: "MW", meaning: fmtTime(kpis.max_overforecast_time), formula: "largest single-period over-forecast", tone: "text-short" },
      {
        label: "Average lead time",
        value: kpis.avg_lead_time_hours == null ? "—" : kpis.avg_lead_time_hours.toFixed(1),
        unit: "h",
        meaning: `${kpis.sample_count.toLocaleString("en-GB")} periods compared`,
        formula: "mean (delivery start − forecast publish time)",
      },
    );
  }
  return (
    <div
      className={`panel grid grid-cols-2 divide-rule overflow-hidden sm:grid-cols-3 ${compact ? "xl:grid-cols-6" : "xl:grid-cols-4 2xl:grid-cols-8"} [&>*]:border-rule [&>*]:border-b [&>*]:border-r`}
      data-testid="kpi-strip"
    >
      {cells.map((c) => (
        <div key={c.label} className="px-4 py-3.5" title={`${c.label}: ${c.formula}`}>
          <div className="text-[12px] text-ink-2">{c.label}</div>
          <div className={`num font-semi-expanded mt-1 text-[22px] font-semibold leading-none ${c.tone ?? "text-ink"}`}>
            {c.value}
            {c.unit && <span className="ml-1 text-[12px] font-normal text-ink-3">{c.unit}</span>}
          </div>
          <div className="mt-1.5 truncate text-[12px] text-ink-3">{c.meaning}</div>
        </div>
      ))}
    </div>
  );
}
