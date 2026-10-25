import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardResponse, TimeseriesPoint } from "../types/api";
import { COLORS, fmtDay, fmtGWh, fmtMW, fmtSigned, fmtTime } from "../lib/format";
import { KpiStrip } from "./KpiStrip";
import { ChartTooltip } from "./ui/ChartTooltip";

interface Props {
  data: DashboardResponse;
  onInspect: (startTime: string) => void;
}

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

const POSTURE_PHRASE: Record<string, string> = {
  raw: "trusting the raw forecast",
  bias: "with the forecast de-biased",
  p90: "with a P90 shortfall buffer",
  p95: "with a P95 shortfall buffer",
};

const gw = (v: number) => `${(v / 1000).toFixed(0)} GW`;

type TipEntry = { name?: string | number; value?: number | number[] | string; color?: string };
export const mwRows = (p: readonly TipEntry[]) =>
  p.map((x) => ({
    name: String(x.name),
    value: Array.isArray(x.value) ? `${fmtMW(x.value[0])} – ${fmtMW(x.value[1])} MW` : `${fmtMW(x.value as number)} MW`,
    color: x.color,
  }));

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
  const windowLabel = days.length === 1 ? fmtDay(days[0]) : `${fmtDay(meta.start_date)} to ${fmtDay(meta.end_date)}`;

  return (
    <div className="space-y-5">
      <section className="panel overflow-hidden">
        <div className="grid lg:grid-cols-[1.35fr_1fr]">
          <div className="p-6">
            <p className="text-[13px] text-ink-2">
              Day-ahead thermal to buy for {windowLabel}, {POSTURE_PHRASE[meta.risk_posture]}
            </p>
            <p className="num font-expanded mt-2 text-[44px] font-bold leading-none text-ink">{fmtGWh(meta.total_recommended_thermal_mwh, 0)}</p>
            <p className="mt-3 max-w-[60ch] text-[14px] leading-relaxed text-ink-2">
              Against {fmtMW(meta.demand_mw)} MW of demand, relying on {fmtGWh(meta.total_risk_adjusted_wind_mwh, 0)} of wind out of a raw forecast of{" "}
              {fmtGWh(meta.total_forecast_mwh, 0)}. Wind actually delivered {fmtGWh(meta.total_actual_mwh, 0)}.
            </p>
          </div>
          <dl className="grid grid-cols-2 border-t border-rule bg-paper/60 lg:border-l lg:border-t-0">
            <Figure term="Left short" detail="Wind fell below what we relied on; covered at imbalance prices" value={fmtGWh(meta.total_residual_shortfall_mwh)} tone="text-short" />
            <Figure term="Over-bought" detail="Thermal that the wind made unnecessary" value={fmtGWh(meta.total_over_procured_mwh)} tone="text-long" />
            <Figure term="Settlement periods" detail="Half-hours in the window" value={meta.settlement_periods.toLocaleString("en-GB")} />
            <Figure term="Average lead time" detail="How far ahead the forecast was made" value={`${kpis.avg_lead_time_hours?.toFixed(1) ?? "—"} h`} />
          </dl>
        </div>
      </section>

      <KpiStrip kpis={kpis} compact />

      <section className="panel p-5">
        <h2 className="panel-title">Forecast available at decision time vs what the wind did</h2>
        <p className="panel-note mt-0.5 max-w-[90ch]">
          {meta.selection_mode === "day_ahead_cutoff"
            ? `Each half-hour uses the latest WINDFOR run published by ${String(meta.cutoff_hour_utc).padStart(2, "0")}:00 UTC the day before.`
            : `Each half-hour uses the latest WINDFOR run published at least ${meta.min_horizon_hours} h earlier.`}{" "}
          The shaded band is where actual wind landed 80% of the time for forecasts made that far ahead. Click the chart to see every revision.
        </p>
        <div className="mt-3 h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={clickHandler} className="cursor-crosshair">
              <defs>
                <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.actual} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={COLORS.actual} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="startTime" tickFormatter={tickFmt} minTickGap={48} tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#D5DEE8" }} />
              <YAxis tickFormatter={gw} width={48} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip title={(l) => `${fmtTime(String(l))} UTC`} rows={mwRows} />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="plainline" />
              <Area dataKey="band" name="80% range for actual" stroke="none" fill={COLORS.band} fillOpacity={0.12} isAnimationActive={false} />
              <Area dataKey="actual_mw" name="Actual wind" stroke={COLORS.actual} strokeWidth={1.8} fill="url(#actualFill)" isAnimationActive={false} />
              <Line dataKey="forecast_mw" name="Forecast at decision time" stroke={COLORS.forecast} dot={false} strokeWidth={1.8} isAnimationActive={false} />
              {meta.risk_posture !== "raw" && (
                <Line dataKey="risk_adjusted_wind_mw" name="Wind we rely on" stroke={COLORS.risk} strokeDasharray="5 4" dot={false} strokeWidth={1.6} isAnimationActive={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section className="panel p-5">
          <h2 className="panel-title">Thermal bought vs thermal needed</h2>
          <p className="panel-note mt-0.5">Demand minus the wind we rely on, against demand minus the wind that actually blew.</p>
          <div className="mt-3 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.timeseries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={clickHandler}>
                <CartesianGrid strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="startTime" tickFormatter={tickFmt} minTickGap={48} tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#D5DEE8" }} />
                <YAxis tickFormatter={gw} width={48} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip title={(l) => `${fmtTime(String(l))} UTC`} rows={mwRows} />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="plainline" />
                <Area dataKey="thermal_procurement_mw" name="Thermal bought day-ahead" stroke={COLORS.thermal} strokeWidth={1.6} fill={COLORS.thermal} fillOpacity={0.14} isAnimationActive={false} />
                <Line dataKey="actual_thermal_needed_mw" name="Thermal actually needed" stroke={COLORS.ink} dot={false} strokeWidth={1.2} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel p-5">
          <h2 className="panel-title">Daily volumes</h2>
          <p className="panel-note mt-0.5">Per delivery day; each decision is made the day before.</p>
          <div className="mt-3 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily_summary} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => String(Number(String(d).slice(8)))} tick={{ fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#D5DEE8" }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}`} width={36} tickLine={false} axisLine={false} label={{ value: "GWh", angle: -90, position: "insideLeft", fill: "#7B8BA1", fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: "rgba(19,35,58,0.04)" }}
                  content={<ChartTooltip title={(l) => `Delivery ${fmtDay(String(l))}`} rows={(p) => p.map((x) => ({ name: String(x.name), value: fmtGWh(x.value as number), color: x.color }))} />}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="square" />
                <Bar dataKey="risk_adjusted_wind_mwh" name="Wind relied on" stackId="a" fill={COLORS.forecast} isAnimationActive={false} />
                <Bar dataKey="recommended_thermal_mwh" name="Thermal bought" stackId="a" fill={COLORS.thermal} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="panel p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="panel-title">Bid schedule for {day ? fmtDay(day) : "—"}</h2>
            <p className="panel-note mt-0.5">One row per settlement period, decided the day before. Open a row to see its forecast revisions.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg p-1.5 text-ink-2 ring-1 ring-rule hover:bg-paper disabled:opacity-30" onClick={() => setDayIdx(Math.max(0, dayIdx - 1))} disabled={dayIdx === 0} aria-label="Previous day">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select value={dayIdx} onChange={(e) => setDayIdx(Number(e.target.value))} aria-label="Schedule day" className="input">
              {days.map((d, i) => (
                <option key={d} value={i}>
                  {fmtDay(d)}
                </option>
              ))}
            </select>
            <button className="rounded-lg p-1.5 text-ink-2 ring-1 ring-rule hover:bg-paper disabled:opacity-30" onClick={() => setDayIdx(Math.min(days.length - 1, dayIdx + 1))} disabled={dayIdx >= days.length - 1} aria-label="Next day">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={() => downloadCsv(data)} className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ink/90">
              <Download className="h-3.5 w-3.5" /> Export CSV ({data.timeseries.length} rows)
            </button>
          </div>
        </div>
        <div className="max-h-[520px] overflow-auto rounded-xl ring-1 ring-rule">
          <table className="font-condensed w-full whitespace-nowrap text-[13px]">
            <thead className="sticky top-0 z-10 bg-paper text-left text-ink-2">
              <tr>
                <th className="px-3 py-2 font-medium">SP</th>
                <th className="px-3 py-2 font-medium">Start</th>
                <th className="px-3 py-2 text-right font-medium">Forecast MW</th>
                <th className="px-3 py-2 font-medium">Published</th>
                <th className="px-3 py-2 text-right font-medium">Lead h</th>
                <th className="px-3 py-2 text-right font-medium">Relied wind MW</th>
                <th className="px-3 py-2 text-right font-medium">Actual MW</th>
                <th className="px-3 py-2 text-right font-medium">Error MW</th>
                <th className="px-3 py-2 text-right font-medium">Thermal buy MW</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="num bg-white">
              {dayRows.map((r) => (
                <tr key={r.startTime} className="border-t border-rule hover:bg-paper/70">
                  <td className="px-3 py-1.5 text-ink-3">{r.settlementPeriod}</td>
                  <td className="px-3 py-1.5">{r.startTime.slice(11, 16)}</td>
                  <td className="px-3 py-1.5 text-right text-fcst">
                    {fmtMW(r.forecast_mw)}
                    {r.is_interpolated && (
                      <span className="text-ink-3" title="Interpolated between hourly points">
                        *
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-ink-2">{fmtTime(r.publishTime)}</td>
                  <td className="px-3 py-1.5 text-right text-ink-2">{r.horizon_hours ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right">{fmtMW(r.risk_adjusted_wind_mw)}</td>
                  <td className="px-3 py-1.5 text-right text-wind">{fmtMW(r.actual_mw)}</td>
                  <td className={`px-3 py-1.5 text-right ${(r.error_mw ?? 0) > 0 ? "text-short" : "text-wind"}`}>{fmtSigned(r.error_mw)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-thermal">{fmtMW(r.thermal_procurement_mw)}</td>
                  <td className="px-3 py-1.5">
                    <button onClick={() => onInspect(r.startTime)} className="rounded-md px-2 py-0.5 text-fcst hover:bg-fcst/10">
                      Revisions
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12px] text-ink-3">Error is forecast minus actual, so positive means wind under-delivered. * marks :30 values interpolated within the forecast run.</p>
      </section>
    </div>
  );
}

function Figure({ term, detail, value, tone = "text-ink" }: { term: string; detail: string; value: string; tone?: string }) {
  return (
    <div className="border-b border-r border-rule px-5 py-4 [&:nth-child(2n)]:border-r-0 [&:nth-last-child(-n+2)]:border-b-0">
      <dt className="text-[12px] text-ink-2">{term}</dt>
      <dd className={`num font-semi-expanded mt-1 text-[20px] font-semibold ${tone}`}>{value}</dd>
      <dd className="mt-0.5 text-[11px] leading-snug text-ink-3">{detail}</dd>
    </div>
  );
}
