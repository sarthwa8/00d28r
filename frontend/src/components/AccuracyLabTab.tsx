import { useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardResponse } from "../types/api";
import { COLORS, fmtMW, fmtPct, fmtSigned, fmtTime } from "../lib/format";
import { ForecastEvolution } from "./ForecastEvolution";
import { KpiStrip } from "./KpiStrip";

const tooltipStyle = { background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 };
const mwFormatter = (v: number | number[], n: string) =>
  Array.isArray(v) ? [`${fmtSigned(v[0])} … ${fmtSigned(v[1])} MW`, n] : [`${fmtMW(v)} MW`, n];

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
  const quantiles: [string, number | null][] = [
    ["P5", kpis.p05_error_mw],
    ["P10", kpis.p10_error_mw],
    ["P25", kpis.p25_error_mw],
    ["P50", kpis.p50_error_mw],
    ["P75", kpis.p75_error_mw],
    ["P90", kpis.p90_error_mw],
    ["P95", kpis.p95_error_mw],
  ];
  const first = data.horizon_accuracy.find((b) => b.sample_count > 0);
  const last = [...data.horizon_accuracy].reverse().find((b) => b.sample_count > 0);
  const degradation = first?.mae_mw && last?.mae_mw ? (100 * (last.mae_mw - first.mae_mw)) / first.mae_mw : null;

  return (
    <div className="space-y-4">
      <KpiStrip kpis={kpis} />

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card p-4">
          <h2 className="card-title">1 · Error vs forecast lead time</h2>
          <p className="card-sub mb-2">
            All {data.meta.all_pairs_sample_count.toLocaleString("en-GB")} forecast–actual pairs in the window, bucketed by
            lead time. MAE grows <span className="num text-amber-300">{fmtPct(degradation, 0)}</span> from {first?.bucket_label} to {last?.bucket_label}.
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.horizon_accuracy} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket_label" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="mw" tickFormatter={(v) => `${(v / 1000).toFixed(1)}`} width={36} label={{ value: "GW", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }} />
                <YAxis yAxisId="n" orientation="right" width={44} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => (n === "Samples" ? [v, n] : [`${fmtMW(v)} MW`, n])} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="n" dataKey="sample_count" name="Samples" fill="#1e293b" isAnimationActive={false} />
                <Line yAxisId="mw" dataKey="rmse_mw" name="RMSE" stroke={COLORS.violet} strokeWidth={2} isAnimationActive={false} />
                <Line yAxisId="mw" dataKey="mae_mw" name="MAE" stroke={COLORS.forecast} strokeWidth={2} isAnimationActive={false} />
                <Line yAxisId="mw" dataKey="mbe_mw" name="Bias (MBE)" stroke={COLORS.shortfall} strokeWidth={2} strokeDasharray="5 3" isAnimationActive={false} />
                <Line yAxisId="mw" dataKey="p90_shortfall_mw" name="P90 shortfall" stroke={COLORS.risk} strokeWidth={1.5} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="card-title">2 · Diurnal error profile (UTC = UK time in January)</h2>
          <p className="card-sub mb-2">Error of the forecasts the desk relied on, by hour of delivery. Band = P10–P90 signed error.</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={diurnal} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(1)}`} width={36} label={{ value: "GW", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={mwFormatter} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={0} stroke="#475569" />
                <Area dataKey="spread" name="P10–P90 error" stroke="none" fill={COLORS.band} fillOpacity={0.15} isAnimationActive={false} />
                <Line dataKey="mae_mw" name="MAE" stroke={COLORS.forecast} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="mbe_mw" name="Bias" stroke={COLORS.shortfall} strokeWidth={2} dot={false} strokeDasharray="5 3" isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="card-title">3 · Signed error distribution (forecast − actual)</h2>
          <p className="card-sub mb-2">
            Skew <span className="num">{kpis.skewness ?? "—"}</span> · excess kurtosis <span className="num">{kpis.excess_kurtosis ?? "—"}</span> · σ{" "}
            <span className="num">{fmtMW(kpis.std_mw)} MW</span>. Red bins = over-forecast (shortfall).
          </p>
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.error_distribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bin_center_mw" tickFormatter={(v) => `${(v / 1000).toFixed(1)}`} tick={{ fontSize: 10 }} label={{ value: "GW", position: "insideBottomRight", fill: "#64748b", fontSize: 11 }} />
                  <YAxis width={32} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(_, p) => (p?.[0] ? `${fmtSigned(p[0].payload.bin_start_mw)} … ${fmtSigned(p[0].payload.bin_end_mw)} MW` : "")}
                    formatter={(v, _n, p) => [`${v}% (${p.payload.count} periods)`, "Share"]}
                  />
                  <ReferenceLine x={0} stroke="#475569" />
                  <Bar dataKey="percentage" isAnimationActive={false}>
                    {data.error_distribution.map((b) => (
                      <Cell key={b.bin_start_mw} fill={(b.bin_center_mw ?? 0) > 0 ? COLORS.shortfall : COLORS.actual} fillOpacity={0.75} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="h-fit w-full text-xs" aria-label="Error quantiles">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1">Quantile</th>
                  <th className="py-1 text-right">Error MW</th>
                </tr>
              </thead>
              <tbody className="num">
                {quantiles.map(([q, v]) => (
                  <tr key={q} className="border-t border-slate-800">
                    <td className="py-1 text-slate-400">{q}</td>
                    <td className={`py-1 text-right ${(v ?? 0) > 0 ? "text-rose-300" : "text-emerald-300"}`}>{fmtSigned(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="card-title">4 · Forecast evolution inspector</h2>
          <div className="mb-3 mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <input
              type="date"
              min="2026-01-01"
              max="2026-02-01"
              value={evoDate}
              onChange={(e) => e.target.value && setEvoDate(e.target.value)}
              aria-label="Evolution date"
              className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200 [color-scheme:dark]"
            />
            <select value={evoSp} onChange={(e) => setEvoSp(Number(e.target.value))} aria-label="Evolution settlement period" className="num rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-200">
              {Array.from({ length: 48 }, (_, i) => (
                <option key={i} value={i + 1}>
                  SP{i + 1} · {String(Math.floor(i / 2)).padStart(2, "0")}:{i % 2 ? "30" : "00"}
                </option>
              ))}
            </select>
            {kpis.max_overforecast_time && (
              <button
                className="rounded-md border border-rose-800 px-2 py-1 text-rose-300 hover:bg-rose-500/10"
                onClick={() => {
                  const t = kpis.max_overforecast_time!;
                  setEvoDate(t.slice(0, 10));
                  const d = new Date(t);
                  setEvoSp(d.getUTCHours() * 2 + Math.floor(d.getUTCMinutes() / 30) + 1);
                }}
              >
                Jump to worst shortfall ({fmtTime(kpis.max_overforecast_time)})
              </button>
            )}
          </div>
          <ForecastEvolution targetTime={evoTarget} cutoffHour={cutoffHour} />
        </section>
      </div>

      <section className="card p-4">
        <h2 className="card-title">Risk-buffer calibration table</h2>
        <p className="card-sub mb-3">
          Empirical signed-error quantiles per lead-time bucket over the full January delivery window. These drive the P10–P90 band and
          the P90/P95 relied-upon wind (buffer = max(0, q) so a buffer never adds wind).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1.5">Lead time</th>
                <th className="py-1.5 text-right">Samples</th>
                <th className="py-1.5 text-right">q10 MW</th>
                <th className="py-1.5 text-right">q90 MW (P90 buffer)</th>
                <th className="py-1.5 text-right">q95 MW (P95 buffer)</th>
                <th className="py-1.5 text-right">Window MAE</th>
                <th className="py-1.5 text-right">Window bias</th>
              </tr>
            </thead>
            <tbody className="num">
              {data.calibration.map((c) => {
                const h = data.horizon_accuracy.find((b) => b.bucket_label === c.bucket_label);
                return (
                  <tr key={c.bucket_label} className="border-t border-slate-800">
                    <td className="py-1.5 text-slate-300">{c.bucket_label}</td>
                    <td className="py-1.5 text-right text-slate-400">{c.n.toLocaleString("en-GB")}</td>
                    <td className="py-1.5 text-right">{fmtSigned(c.q10)}</td>
                    <td className="py-1.5 text-right text-amber-300">{fmtSigned(c.q90)}</td>
                    <td className="py-1.5 text-right text-amber-300">{fmtSigned(c.q95)}</td>
                    <td className="py-1.5 text-right">{fmtMW(h?.mae_mw)}</td>
                    <td className="py-1.5 text-right text-rose-300">{fmtSigned(h?.mbe_mw)}</td>
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
