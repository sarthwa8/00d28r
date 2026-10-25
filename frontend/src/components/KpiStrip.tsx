import { Info } from "lucide-react";
import type { Kpis } from "../types/api";
import { fmtMW, fmtPct, fmtSigned, fmtTime } from "../lib/format";

interface Card {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  tone?: "default" | "risk" | "bias" | "good";
  sub?: string;
}

const TONE = {
  default: "text-white",
  risk: "text-amber-300",
  bias: "text-rose-300",
  good: "text-emerald-300",
};

export function KpiStrip({ kpis, compact = false }: { kpis: Kpis; compact?: boolean }) {
  const cards: Card[] = [
    { label: "MAE", value: fmtMW(kpis.mae_mw), unit: "MW", hint: "Mean Absolute Error = mean(|forecast − actual|)", sub: `NMAE ${fmtPct(kpis.nmae_pct)} of peak` },
    { label: "RMSE", value: fmtMW(kpis.rmse_mw), unit: "MW", hint: "Root Mean Squared Error = √mean(e²); penalises large misses" },
    {
      label: "Bias (MBE)",
      value: fmtSigned(kpis.mbe_mw),
      unit: "MW",
      tone: "bias",
      hint: "Mean(forecast − actual). Positive = over-forecast → wind shortfall risk",
      sub: `${fmtPct(kpis.shortfall_period_pct, 0)} of periods over-forecast`,
    },
    { label: "MAPE", value: fmtPct(kpis.mape_pct), hint: "mean(|e| / max(actual, 100 MW)) — floored to avoid lull blow-ups" },
    {
      label: "P90 Shortfall Buffer",
      value: fmtMW(kpis.p90_shortfall_buffer_mw),
      unit: "MW",
      tone: "risk",
      hint: "max(0, 90th percentile of e). Hold this much extra thermal and wind under-delivery exceeds it only 10% of the time",
    },
    {
      label: "P95 Shortfall Buffer",
      value: fmtMW(kpis.p95_shortfall_buffer_mw),
      unit: "MW",
      tone: "risk",
      hint: "max(0, 95th percentile of e) — stress-case backup volume",
    },
  ];
  if (!compact) {
    cards.push(
      {
        label: "Worst Shortfall",
        value: fmtMW(kpis.max_overforecast_mw),
        unit: "MW",
        tone: "bias",
        hint: "Largest single-period over-forecast in the window",
        sub: fmtTime(kpis.max_overforecast_time),
      },
      {
        label: "Avg Lead Time",
        value: kpis.avg_lead_time_hours == null ? "—" : kpis.avg_lead_time_hours.toFixed(1),
        unit: "h",
        hint: "Mean (startTime − publishTime) of the forecasts the desk actually relied on",
        sub: `N = ${kpis.sample_count.toLocaleString("en-GB")} periods`,
      },
    );
  }
  return (
    <div className={`grid gap-3 ${compact ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6" : "grid-cols-2 md:grid-cols-4 xl:grid-cols-8"}`} data-testid="kpi-strip">
      {cards.map((c) => (
        <div key={c.label} className="card p-3" title={c.hint}>
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {c.label}
            <Info className="h-3 w-3 text-slate-600" aria-hidden />
          </div>
          <div className={`num mt-1 text-xl font-semibold ${TONE[c.tone ?? "default"]}`}>
            {c.value}
            {c.unit && <span className="ml-1 text-xs font-normal text-slate-500">{c.unit}</span>}
          </div>
          {c.sub && <div className="num mt-0.5 truncate text-[11px] text-slate-500">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}
