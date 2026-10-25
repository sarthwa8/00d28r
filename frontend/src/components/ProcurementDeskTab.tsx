import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardResponse, TimeseriesPoint } from "../types/api";
import { COLORS, POSTURE_LABEL, fmtDay, fmtGWh, fmtMW, fmtSigned, fmtTime } from "../lib/format";
import { KpiStrip } from "./KpiStrip";

interface Props {
  data: DashboardResponse;
  onInspect: (startTime: string) => void;
}

const tooltipStyle = { background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 };

const CSV_COLUMNS: (keyof TimeseriesPoint)[] = [
  "startTime",
  "settlementDate",
  "settlementPeriod",
  "forecast_mw",
  "publishTime",
  "horizon_hours",
  "is_interpolated",
  "p10_bound_mw",
  "p90_bound_mw",
  "risk_adjusted_wind_mw",
  "actual_mw",
  "error_mw",
  "thermal_procurement_mw",
  "actual_thermal_needed_mw",
];

export function toCsv(rows: TimeseriesPoint[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map((c) => (r[c] == null ? "" : String(r[c]))).join(","));
  return lines.join("\n");
}

function downloadCsv(data: DashboardResponse) {
  const blob = new Blob([toCsv(data.timeseries)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `windsight_procurement_${data.meta.start_date}_${data.meta.end_date}_${data.meta.risk_posture}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProcurementDeskTab({ data, onInspect }: Props) {
  const { meta, kpis } = data;
  const days = useMemo(() => [...new Set(data.timeseries.map((p) => p.settlementDate))], [data.timeseries]);
  const [dayIdx, setDayIdx] = useState(0);
  const day = days[Math.min(dayIdx, days.length - 1)];
  const dayRows = data.timeseries.filter((p) => p.settlementDate === day);

  const chartData = useMemo(
    () =>
      data.timeseries.map((p) => ({
        ...p,
        band: p.p10_bound_mw != null && p.p90_bound_mw != null ? [p.p10_bound_mw, p.p90_bound_mw] : null,
      })),
    [data.timeseries],
  );
  const multiDay = days.length > 1;
  const tickFmt = (v: string) => (multiDay ? fmtTime(v).split(" ").slice(0, 2).join(" ") : fmtTime(v).split(" ")[2]);
  const clickHandler = (s: { activePayload?: { payload: TimeseriesPoint }[] } | null) => {
    const p = s?.activePayload?.[0]?.payload;
    if (p) onInspect(p.startTime);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Summary
          label="Recommended day-ahead thermal buy"
          value={fmtGWh(meta.total_recommended_thermal_mwh)}
          sub={`${POSTURE_LABEL[meta.risk_posture]} · demand ${fmtMW(meta.demand_mw)} MW`}
          tone="text-amber-300"
        />
        <Summary label="Risk-adjusted wind relied upon" value={fmtGWh(meta.total_risk_adjusted_wind_mwh)} sub={`raw forecast ${fmtGWh(meta.total_forecast_mwh)}`} tone="text-sky-300" />
        <Summary label="Actual wind delivered" value={fmtGWh(meta.total_actual_mwh)} sub={`${meta.settlement_periods.toLocaleString("en-GB")} settlement periods`} tone="text-emerald-300" />
        <Summary
          label="Residual short exposure"
          value={fmtGWh(meta.total_residual_shortfall_mwh)}
          sub={`over-procured (long): ${fmtGWh(meta.total_over_procured_mwh)}`}
          tone="text-rose-300"
          hint="Short = energy in periods where actual wind fell below the relied-upon wind, i.e. volume left to the imbalance market. Long = thermal bought beyond what realised wind required."
        />
      </div>

      <KpiStrip kpis={kpis} compact />

      <section className="card p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="card-title">Latest eligible forecast vs actual wind generation</h2>
            <p className="card-sub">
              {meta.selection_mode === "day_ahead_cutoff"
                ? `Forecast = latest WINDFOR run published at or before ${String(meta.cutoff_hour_utc).padStart(2, "0")}:00 UTC on D-1.`
                : `Forecast = latest WINDFOR run published ≥ ${meta.min_horizon_hours}h before each settlement period.`}{" "}
              Shaded band = empirical P10–P90 range for actual wind given the forecast's lead time. Click any point to inspect its revisions.
            </p>
          </div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} onClick={clickHandler}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="startTime" tickFormatter={tickFmt} minTickGap={40} tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => (v / 1000).toFixed(0)} width={36} label={{ value: "GW", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(l) => `${fmtTime(String(l))} UTC`}
                formatter={(v: number | number[], name: string) =>
                  Array.isArray(v) ? [`${fmtMW(v[0])} – ${fmtMW(v[1])} MW`, name] : [`${fmtMW(v)} MW`, name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area dataKey="band" name="P10–P90 band" stroke="none" fill={COLORS.band} fillOpacity={0.15} isAnimationActive={false} />
              <Line dataKey="forecast_mw" name="Forecast (WINDFOR)" stroke={COLORS.forecast} dot={false} strokeWidth={1.6} isAnimationActive={false} />
              <Line dataKey="actual_mw" name="Actual (FUELHH)" stroke={COLORS.actual} dot={false} strokeWidth={1.6} isAnimationActive={false} />
              {meta.risk_posture !== "raw" && (
                <Line dataKey="risk_adjusted_wind_mw" name={`Relied-upon wind (${POSTURE_LABEL[meta.risk_posture]})`} stroke={COLORS.risk} strokeDasharray="4 3" dot={false} strokeWidth={1.3} isAnimationActive={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="card p-4">
          <h2 className="card-title">Residual thermal gap</h2>
          <p className="card-sub mb-2">Recommended day-ahead thermal buy (demand − relied-upon wind) vs thermal that was actually needed given realised wind.</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.timeseries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} onClick={clickHandler}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="startTime" tickFormatter={tickFmt} minTickGap={40} tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => (v / 1000).toFixed(0)} width={36} label={{ value: "GW", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => `${fmtTime(String(l))} UTC`} formatter={(v: number, n: string) => [`${fmtMW(v)} MW`, n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area dataKey="thermal_procurement_mw" name="Recommended thermal buy" stroke={COLORS.thermal} fill={COLORS.thermal} fillOpacity={0.18} dot={false} isAnimationActive={false} />
                <Line dataKey="actual_thermal_needed_mw" name="Thermal actually needed" stroke={COLORS.shortfall} dot={false} strokeWidth={1.3} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card p-4">
          <h2 className="card-title">Daily procurement volumes</h2>
          <p className="card-sub mb-2">Per delivery day (decision made on D-1).</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily_summary} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(d) => String(d).slice(8)} tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => (v / 1000).toFixed(0)} width={36} label={{ value: "GWh", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => `Delivery ${fmtDay(String(d))}`} formatter={(v: number, n: string) => [fmtGWh(v), n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="recommended_thermal_mwh" name="Thermal buy" stackId="a" fill={COLORS.thermal} isAnimationActive={false} />
                <Bar dataKey="risk_adjusted_wind_mwh" name="Relied-upon wind" stackId="a" fill={COLORS.forecast} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="card-title">Settlement-period procurement schedule</h2>
            <p className="card-sub">
              Delivery {day ? fmtDay(day) : "—"} · decision on D-1 · {dayRows.length} periods
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30" onClick={() => setDayIdx(Math.max(0, dayIdx - 1))} disabled={dayIdx === 0} aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select value={dayIdx} onChange={(e) => setDayIdx(Number(e.target.value))} aria-label="Schedule day" className="num rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs">
              {days.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <button className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30" onClick={() => setDayIdx(Math.min(days.length - 1, dayIdx + 1))} disabled={dayIdx >= days.length - 1} aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={() => downloadCsv(data)} className="flex items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20">
              <Download className="h-3.5 w-3.5" /> Export CSV ({data.timeseries.length} rows)
            </button>
          </div>
        </div>
        <div className="max-h-[480px] overflow-auto rounded-lg border border-slate-800">
          <table className="w-full whitespace-nowrap text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">SP</th>
                <th className="px-3 py-2">Start (UTC)</th>
                <th className="px-3 py-2 text-right">Forecast MW</th>
                <th className="px-3 py-2">Published</th>
                <th className="px-3 py-2 text-right">Lead h</th>
                <th className="px-3 py-2 text-right">Relied wind MW</th>
                <th className="px-3 py-2 text-right">Actual MW</th>
                <th className="px-3 py-2 text-right">Error MW</th>
                <th className="px-3 py-2 text-right">Thermal buy MW</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="num">
              {dayRows.map((r) => (
                <tr key={r.startTime} className="border-t border-slate-800/80 hover:bg-slate-800/40">
                  <td className="px-3 py-1.5 text-slate-400">{r.settlementPeriod}</td>
                  <td className="px-3 py-1.5">{r.startTime.slice(11, 16)}</td>
                  <td className="px-3 py-1.5 text-right text-sky-300">
                    {fmtMW(r.forecast_mw)}
                    {r.is_interpolated && <span className="text-slate-500" title="interpolated between hourly points">*</span>}
                  </td>
                  <td className="px-3 py-1.5 text-slate-400">{fmtTime(r.publishTime)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-400">{r.horizon_hours ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right text-amber-200">{fmtMW(r.risk_adjusted_wind_mw)}</td>
                  <td className="px-3 py-1.5 text-right text-emerald-300">{fmtMW(r.actual_mw)}</td>
                  <td className={`px-3 py-1.5 text-right ${(r.error_mw ?? 0) > 0 ? "text-rose-300" : "text-emerald-300"}`}>{fmtSigned(r.error_mw)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-amber-300">{fmtMW(r.thermal_procurement_mw)}</td>
                  <td className="px-3 py-1.5">
                    <button onClick={() => onInspect(r.startTime)} className="flex items-center gap-1 text-sky-400 hover:text-sky-200">
                      <Search className="h-3 w-3" /> Revisions
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Error = forecast − actual (positive = over-forecast / wind shortfall). * = :30 value interpolated within the forecast run.</p>
      </section>
    </div>
  );
}

function Summary({ label, value, sub, tone, hint }: { label: string; value: string; sub: string; tone: string; hint?: string }) {
  return (
    <div className="card p-4" title={hint}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`num mt-1 text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="num mt-1 truncate text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}
