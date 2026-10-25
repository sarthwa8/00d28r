import { useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardResponse } from "../types/api";
import { COLORS, fmtMW, fmtPct, fmtSigned, fmtTime } from "../lib/format";
import { ErrorCalendar } from "./ErrorCalendar";
import { ForecastEvolution } from "./ForecastEvolution";
import { KpiStrip } from "./KpiStrip";
import { ChartFrame, DataTable } from "./ui/ChartFrame";
import { ChartTooltip } from "./ui/ChartTooltip";

type TipEntry = { name?: string | number; value?: number | number[] | string; color?: string };
const signedRows = (p: readonly TipEntry[]) =>
  p.map((x) => ({
    name: String(x.name),
    value: Array.isArray(x.value) ? `${fmtSigned(x.value[0])} to ${fmtSigned(x.value[1])} MW` : `${fmtSigned(x.value as number)} MW`,
    color: x.color,
  }));
const gwAxis = (v: number) => `${(v / 1000).toFixed(1)}`;
const axisProps = { tickLine: false, axisLine: { stroke: COLORS.rule } } as const;

/** Direct label at a line's last point (selective labelling: the endpoint only). */
function EndLabel({ name }: { name: string }) {
  return function Label(props: { x?: number | string; y?: number | string; index?: number }) {
    if (props.index !== 6 || props.x == null || props.y == null) return <g />;
    return (
      <text x={Number(props.x) + 8} y={Number(props.y) + 4} fontSize={11} fill="var(--c-ink-3)">
        {name}
      </text>
    );
  };
}

export function AccuracyLabTab({ data, cutoffHour, onInspect }: { data: DashboardResponse; cutoffHour: number; onInspect: (startTime: string) => void }) {
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
  const quantiles: [string, number | null][] = [
    ["P5", kpis.p05_error_mw],
    ["P10", kpis.p10_error_mw],
    ["P25", kpis.p25_error_mw],
    ["P50 (median)", kpis.p50_error_mw],
    ["P75", kpis.p75_error_mw],
    ["P90 (P90 cover)", kpis.p90_error_mw],
    ["P95 (P95 cover)", kpis.p95_error_mw],
  ];
  const first = data.horizon_accuracy.find((b) => b.sample_count > 0);
  const last = [...data.horizon_accuracy].reverse().find((b) => b.sample_count > 0);
  const degradation = first?.mae_mw && last?.mae_mw ? (100 * (last.mae_mw - first.mae_mw)) / first.mae_mw : null;
  const worstHour = [...data.diurnal_profile].filter((d) => d.mae_mw != null).sort((a, b) => (b.mae_mw ?? 0) - (a.mae_mw ?? 0))[0];

  return (
    <div className="space-y-5">
      <KpiStrip kpis={kpis} daily={data.daily_summary} />

      <ErrorCalendar data={data} onInspect={onInspect} />

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartFrame
          title="The further ahead, the bigger the miss"
          note={
            <>
              All {data.meta.all_pairs_sample_count.toLocaleString("en-GB")} forecast–actual pairs in the window, grouped by lead time. The typical miss grows{" "}
              <strong className="text-ink">{fmtPct(degradation, 0)}</strong> from {first?.bucket_label} to {last?.bucket_label}.
            </>
          }
          table={
            <DataTable
              label="Error by lead time"
              head={["Lead time", "Samples", "MAE MW", "RMSE MW", "Bias MW", "P90 cover MW"]}
              rows={data.horizon_accuracy.map((b) => [b.bucket_label, b.sample_count.toLocaleString("en-GB"), fmtMW(b.mae_mw), fmtMW(b.rmse_mw), fmtSigned(b.mbe_mw), fmtMW(b.p90_shortfall_mw)])}
            />
          }
        >
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.horizon_accuracy} margin={{ top: 8, right: 64, left: 0, bottom: 0 }} syncId="horizon">
                <CartesianGrid vertical={false} />
                <XAxis dataKey="bucket_label" tick={false} height={4} {...axisProps} />
                <YAxis tickFormatter={gwAxis} width={36} tickLine={false} axisLine={false} label={{ value: "GW", angle: -90, position: "insideLeft", fill: COLORS.muted, fontSize: 11 }} />
                <Tooltip content={<ChartTooltip title={(l) => `Lead time ${l}`} rows={signedRows} />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} iconType="plainline" />
                <Line dataKey="p90_shortfall_mw" name="P90 cover" stroke={COLORS.thermal} strokeWidth={2} dot={{ r: 3.5, strokeWidth: 2, stroke: COLORS.panel, fill: COLORS.thermal }} isAnimationActive={false} label={EndLabel({ name: "P90 cover" })} />
                <Line dataKey="rmse_mw" name="RMSE" stroke={COLORS.muted} strokeWidth={2} dot={{ r: 3.5, strokeWidth: 2, stroke: COLORS.panel, fill: COLORS.muted }} isAnimationActive={false} label={EndLabel({ name: "RMSE" })} />
                <Line dataKey="mae_mw" name="MAE" stroke={COLORS.forecast} strokeWidth={2} dot={{ r: 3.5, strokeWidth: 2, stroke: COLORS.panel, fill: COLORS.forecast }} isAnimationActive={false} label={EndLabel({ name: "MAE" })} />
                <Line dataKey="mbe_mw" name="Bias" stroke={COLORS.shortfall} strokeWidth={2} dot={{ r: 3.5, strokeWidth: 2, stroke: COLORS.panel, fill: COLORS.shortfall }} isAnimationActive={false} label={EndLabel({ name: "Bias" })} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* Sample counts are a different unit, so they get their own small multiple instead of a second y-axis. */}
          <div className="mt-1 h-[86px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.horizon_accuracy} margin={{ top: 4, right: 64, left: 0, bottom: 0 }} syncId="horizon">
                <XAxis dataKey="bucket_label" tick={{ fontSize: 11 }} {...axisProps} />
                <YAxis width={36} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickCount={2} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}K` : String(v))} />
                <Tooltip cursor={{ fill: COLORS.hover }} content={<ChartTooltip title={(l) => `Lead time ${l}`} rows={(p) => [{ name: "Forecast–actual pairs", value: Number(p[0].value).toLocaleString("en-GB") }]} />} />
                <Bar dataKey="sample_count" name="Samples" fill={COLORS.muted} fillOpacity={0.35} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-ink-3">Lower panel: forecast–actual pairs behind each bucket.</p>
        </ChartFrame>

        <ChartFrame
          title="When in the day the forecast misses"
          note={
            <>
              Error of the forecasts the desk relied on, by hour of delivery (UTC is UK time in January). The worst hour is <strong className="text-ink">{worstHour?.label}</strong>. The band
              holds the middle 80% of errors.
            </>
          }
          table={
            <DataTable
              label="Error by hour of day"
              head={["Hour (UTC)", "MAE MW", "Bias MW", "P10 error MW", "P90 error MW"]}
              rows={data.diurnal_profile.map((d) => [d.label, fmtMW(d.mae_mw), fmtSigned(d.mbe_mw), fmtSigned(d.p10_error_mw), fmtSigned(d.p90_error_mw)])}
            />
          }
        >
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={diurnal} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} {...axisProps} />
                <YAxis tickFormatter={gwAxis} width={36} tickLine={false} axisLine={false} label={{ value: "GW", angle: -90, position: "insideLeft", fill: COLORS.muted, fontSize: 11 }} />
                <Tooltip content={<ChartTooltip title={(l) => `${l} UTC`} rows={signedRows} />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="plainline" />
                <ReferenceLine y={0} stroke={COLORS.muted} />
                <Area dataKey="spread" name="Middle 80% of errors" stroke="none" fill={COLORS.band} fillOpacity={0.1} isAnimationActive={false} />
                <Line dataKey="mae_mw" name="MAE" stroke={COLORS.forecast} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="mbe_mw" name="Bias" stroke={COLORS.shortfall} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartFrame>

        <section className="panel min-w-0 p-5">
          <h2 className="panel-title">How the errors are spread</h2>
          <p className="panel-note mt-0.5">
            Forecast minus actual for every period. Crimson bars are over-forecasts, where wind under-delivered. Skew {kpis.skewness ?? "—"}, excess kurtosis {kpis.excess_kurtosis ?? "—"},
            standard deviation {fmtMW(kpis.std_mw)} MW.
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-[1fr_210px]">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.error_distribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="bin_center_mw" tickFormatter={gwAxis} tick={{ fontSize: 10 }} {...axisProps} label={{ value: "GW", position: "insideBottomRight", fill: COLORS.muted, fontSize: 11 }} />
                  <YAxis width={36} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: COLORS.hover }}
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
                  <ReferenceLine x={0} stroke={COLORS.muted} />
                  <Bar dataKey="percentage" isAnimationActive={false} radius={[4, 4, 0, 0]} maxBarSize={24}>
                    {data.error_distribution.map((b) => (
                      <Cell key={b.bin_start_mw} fill={(b.bin_center_mw ?? 0) > 0 ? COLORS.shortfall : COLORS.long} fillOpacity={0.85} />
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
                {quantiles.map(([q, v]) => (
                  <tr key={q} className="border-t border-rule">
                    <td className="py-1.5 text-ink-2">{q}</td>
                    <td className="py-1.5 text-right font-medium text-ink">
                      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${(v ?? 0) > 0 ? "bg-short" : "bg-long"}`} />
                      {fmtSigned(v)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel min-w-0 p-5">
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
                className="rounded-lg px-2.5 py-1.5 text-ink ring-1 ring-rule hover:bg-paper"
                onClick={() => {
                  const t = kpis.max_overforecast_time!;
                  setEvoDate(t.slice(0, 10));
                  const d = new Date(t);
                  setEvoSp(d.getUTCHours() * 2 + Math.floor(d.getUTCMinutes() / 30) + 1);
                }}
              >
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-short" />
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
          Signed-error percentiles for each lead-time bucket, over the whole January delivery window. They set the 80% band and the de-bias, P90 and P95 haircuts. A haircut is never
          negative, so the desk never relies on more wind than was forecast.
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
            <tbody className="num bg-panel">
              {data.calibration.map((c) => {
                const h = data.horizon_accuracy.find((b) => b.bucket_label === c.bucket_label);
                return (
                  <tr key={c.bucket_label} className="border-t border-rule">
                    <td className="px-3 py-1.5 font-medium">{c.bucket_label}</td>
                    <td className="px-3 py-1.5 text-right text-ink-2">{c.n.toLocaleString("en-GB")}</td>
                    <td className="px-3 py-1.5 text-right">{fmtSigned(c.q10)}</td>
                    <td className="px-3 py-1.5 text-right">{fmtSigned(c.q50)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{fmtSigned(c.q90)}</td>
                    <td className="px-3 py-1.5 text-right">{fmtSigned(c.q95)}</td>
                    <td className="px-3 py-1.5 text-right">{fmtMW(h?.mae_mw)}</td>
                    <td className="px-3 py-1.5 text-right">{fmtSigned(h?.mbe_mw)}</td>
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
