import { useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardResponse } from "../types/api";
import { COLORS, fmtMW, fmtPct, fmtSigned, fmtTime } from "../lib/format";
import { ForecastEvolution } from "./ForecastEvolution";
import { KpiStrip } from "./KpiStrip";
import { ChartTooltip } from "./ui/ChartTooltip";

type TipEntry = { name?: string | number; value?: number | number[] | string; color?: string };
const signedRows = (p: readonly TipEntry[]) =>
  p.map((x) => ({
    name: String(x.name),
    value: Array.isArray(x.value) ? `${fmtSigned(x.value[0])} to ${fmtSigned(x.value[1])} MW` : x.name === "Samples" ? String(x.value) : `${fmtSigned(x.value as number)} MW`,
    color: x.color,
  }));
const gwAxis = (v: number) => `${(v / 1000).toFixed(1)}`;

export function AccuracyLabTab({ data, cutoffHour }: { data: DashboardResponse; cutoffHour: number }) {
  const { kpis } = data;
  const defaultTarget = kpis.max_overforecast_time ?? data.timeseries[0]?.startTime ?? "2026-01-15T18:00:00Z";
  const [evoDate, setEvoDate] = useState(defaultTarget.slice(0, 10));
  const [evoSp, setEvoSp] = useState(() => {
    const d = new Date(defaultTarget);
    return d.getUTCHours() * 2 + Math.floor(d.getUTCMinutes() / 30) + 1;
  });
  const minutes = (evoSp - 1) * 30;
  const evoTarget = `${evoDate}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00Z`;

  const diurnal = data.diurnal_profile.map((d) => ({
    ...d,
    spread: d.p10_error_mw != null && d.p90_error_mw != null ? [d.p10_error_mw, d.p90_error_mw] : null,
  }));
  const quantiles: [string, number | null, string][] = [
    ["P5", kpis.p05_error_mw, "5% of periods were below this"],
    ["P10", kpis.p10_error_mw, ""],
    ["P25", kpis.p25_error_mw, ""],
    ["P50", kpis.p50_error_mw, "The median miss"],
    ["P75", kpis.p75_error_mw, ""],
    ["P90", kpis.p90_error_mw, "The P90 cover"],
    ["P95", kpis.p95_error_mw, "The P95 cover"],
  ];
  const first = data.horizon_accuracy.find((b) => b.sample_count > 0);
  const last = [...data.horizon_accuracy].reverse().find((b) => b.sample_count > 0);
  const degradation = first?.mae_mw && last?.mae_mw ? (100 * (last.mae_mw - first.mae_mw)) / first.mae_mw : null;
  const worstHour = [...data.diurnal_profile].filter((d) => d.mae_mw != null).sort((a, b) => (b.mae_mw ?? 0) - (a.mae_mw ?? 0))[0];

  return (
    <div className="space-y-5">
      <KpiStrip kpis={kpis} />

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="panel p-5">
          <h2 className="panel-title">The further ahead, the bigger the miss</h2>
          <p className="panel-note mt-0.5">
            All {data.meta.all_pairs_sample_count.toLocaleString("en-GB")} forecast–actual pairs in the window, grouped by lead time. The typical miss grows{" "}
            <strong className="num text-ink">{fmtPct(degradation, 0)}</strong> from {first?.bucket_label} to {last?.bucket_label}.
          </p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.horizon_accuracy} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="bucket_label" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#D5DEE8" }} />
                <YAxis yAxisId="mw" tickFormatter={gwAxis} width={36} tickLine={false} axisLine={false} label={{ value: "GW", angle: -90, position: "insideLeft", fill: "#7B8BA1", fontSize: 11 }} />
                <YAxis yAxisId="n" orientation="right" width={44} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "rgba(19,35,58,0.04)" }} content={<ChartTooltip title={(l) => `Lead time ${l}`} rows={signedRows} />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="plainline" />
                <Bar yAxisId="n" dataKey="sample_count" name="Samples" fill="#E3E9F0" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Line yAxisId="mw" dataKey="rmse_mw" name="RMSE" stroke={COLORS.violet} strokeWidth={2} isAnimationActive={false} />
                <Line yAxisId="mw" dataKey="mae_mw" name="MAE" stroke={COLORS.forecast} strokeWidth={2.2} isAnimationActive={false} />
                <Line yAxisId="mw" dataKey="mbe_mw" name="Bias" stroke={COLORS.shortfall} strokeWidth={2} strokeDasharray="5 4" isAnimationActive={false} />
                <Line yAxisId="mw" dataKey="p90_shortfall_mw" name="P90 cover" stroke={COLORS.risk} strokeWidth={1.6} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="panel-title">When in the day the forecast misses</h2>
          <p className="panel-note mt-0.5">
            Error of the forecasts the desk relied on, by hour of delivery (UTC is UK time in January). The worst hour is{" "}
            <strong className="text-ink">{worstHour?.label}</strong>. The band holds the middle 80% of errors.
          </p>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={diurnal} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} tickLine={false} axisLine={{ stroke: "#D5DEE8" }} />
                <YAxis tickFormatter={gwAxis} width={36} tickLine={false} axisLine={false} label={{ value: "GW", angle: -90, position: "insideLeft", fill: "#7B8BA1", fontSize: 11 }} />
                <Tooltip content={<ChartTooltip title={(l) => `${l} UTC`} rows={signedRows} />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="plainline" />
                <ReferenceLine y={0} stroke="#7B8BA1" />
                <Area dataKey="spread" name="Middle 80% of errors" stroke="none" fill={COLORS.band} fillOpacity={0.12} isAnimationActive={false} />
                <Line dataKey="mae_mw" name="MAE" stroke={COLORS.forecast} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                <Line dataKey="mbe_mw" name="Bias" stroke={COLORS.shortfall} strokeWidth={2} dot={false} strokeDasharray="5 4" isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="panel-title">How the errors are spread</h2>
          <p className="panel-note mt-0.5">
            Forecast minus actual for every period. Red bars are over-forecasts, where wind under-delivered. Skew {kpis.skewness ?? "—"}, excess kurtosis{" "}
            {kpis.excess_kurtosis ?? "—"}, standard deviation {fmtMW(kpis.std_mw)} MW.
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-[1fr_200px]">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.error_distribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={1}>
                  <CartesianGrid strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="bin_center_mw" tickFormatter={gwAxis} tick={{ fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#D5DEE8" }} label={{ value: "GW", position: "insideBottomRight", fill: "#7B8BA1", fontSize: 11 }} />
                  <YAxis width={36} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(19,35,58,0.04)" }}
                    content={
                      <ChartTooltip
                        title={(_, p) => {
                          const b = (p[0] as { payload: { bin_start_mw: number; bin_end_mw: number } }).payload;
                          return `${fmtSigned(b.bin_start_mw)} to ${fmtSigned(b.bin_end_mw)} MW`;
                        }}
                        rows={(p) => [{ name: "Share of periods", value: `${p[0].value}% (${(p[0].payload as { count: number }).count})` }]}
                      />
                    }
                  />
                  <ReferenceLine x={0} stroke="#7B8BA1" />
                  <Bar dataKey="percentage" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                    {data.error_distribution.map((b) => (
                      <Cell key={b.bin_start_mw} fill={(b.bin_center_mw ?? 0) > 0 ? COLORS.shortfall : COLORS.actual} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="h-fit w-full text-[13px]" aria-label="Error quantiles">
              <thead>
                <tr className="text-left text-ink-2">
                  <th className="py-1 font-medium">Percentile</th>
                  <th className="py-1 text-right font-medium">Error MW</th>
                </tr>
              </thead>
              <tbody className="num">
                {quantiles.map(([q, v, note]) => (
                  <tr key={q} className="border-t border-rule" title={note || undefined}>
                    <td className="py-1.5 text-ink-2">{q}</td>
                    <td className={`py-1.5 text-right font-medium ${(v ?? 0) > 0 ? "text-short" : "text-wind"}`}>{fmtSigned(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="panel-title">Follow one half-hour through every forecast run</h2>
          <div className="mb-3 mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            <input type="date" min="2026-01-01" max="2026-02-01" value={evoDate} onChange={(e) => e.target.value && setEvoDate(e.target.value)} aria-label="Evolution date" className="input" />
            <select value={evoSp} onChange={(e) => setEvoSp(Number(e.target.value))} aria-label="Evolution settlement period" className="input">
              {Array.from({ length: 48 }, (_, i) => (
                <option key={i} value={i + 1}>
                  SP{i + 1}, {String(Math.floor(i / 2)).padStart(2, "0")}:{i % 2 ? "30" : "00"}
                </option>
              ))}
            </select>
            {kpis.max_overforecast_time && (
              <button
                className="rounded-lg px-2.5 py-1.5 text-short ring-1 ring-short/30 hover:bg-short/5"
                onClick={() => {
                  const t = kpis.max_overforecast_time!;
                  setEvoDate(t.slice(0, 10));
                  const d = new Date(t);
                  setEvoSp(d.getUTCHours() * 2 + Math.floor(d.getUTCMinutes() / 30) + 1);
                }}
              >
                Show the worst shortfall ({fmtTime(kpis.max_overforecast_time)})
              </button>
            )}
          </div>
          <ForecastEvolution targetTime={evoTarget} cutoffHour={cutoffHour} />
        </section>
      </div>

      <section className="panel p-5">
        <h2 className="panel-title">Risk-buffer calibration</h2>
        <p className="panel-note mt-0.5 max-w-[95ch]">
          Signed-error percentiles for each lead-time bucket, over the whole January delivery window. They set the 80% band and the de-bias, P90 and P95 haircuts.
          A haircut is never negative, so the desk never relies on more wind than was forecast.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-rule">
          <table className="font-condensed w-full text-[13px]">
            <thead className="bg-paper text-left text-ink-2">
              <tr>
                <th className="px-3 py-2 font-medium">Lead time</th>
                <th className="px-3 py-2 text-right font-medium">Samples</th>
                <th className="px-3 py-2 text-right font-medium">q10</th>
                <th className="px-3 py-2 text-right font-medium">q50, de-bias haircut</th>
                <th className="px-3 py-2 text-right font-medium">q90, P90 haircut</th>
                <th className="px-3 py-2 text-right font-medium">q95, P95 haircut</th>
                <th className="px-3 py-2 text-right font-medium">MAE in window</th>
                <th className="px-3 py-2 text-right font-medium">Bias in window</th>
              </tr>
            </thead>
            <tbody className="num bg-white">
              {data.calibration.map((c) => {
                const h = data.horizon_accuracy.find((b) => b.bucket_label === c.bucket_label);
                return (
                  <tr key={c.bucket_label} className="border-t border-rule">
                    <td className="px-3 py-1.5 font-medium">{c.bucket_label}</td>
                    <td className="px-3 py-1.5 text-right text-ink-2">{c.n.toLocaleString("en-GB")}</td>
                    <td className="px-3 py-1.5 text-right">{fmtSigned(c.q10)}</td>
                    <td className="px-3 py-1.5 text-right text-fcst">{fmtSigned(c.q50)}</td>
                    <td className="px-3 py-1.5 text-right text-thermal">{fmtSigned(c.q90)}</td>
                    <td className="px-3 py-1.5 text-right text-thermal">{fmtSigned(c.q95)}</td>
                    <td className="px-3 py-1.5 text-right">{fmtMW(h?.mae_mw)}</td>
                    <td className="px-3 py-1.5 text-right text-short">{fmtSigned(h?.mbe_mw)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
