import { useEffect, useMemo, useState } from "react";
import { Area, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../services/apiClient";
import type { DashboardMeta, DashboardResponse, RiskPosture } from "../types/api";
import { COLORS, POSTURE_LABEL, fmtGWh, fmtMW, fmtPct, fmtSigned, fmtTime } from "../lib/format";
import { ChartTooltip } from "./ui/ChartTooltip";

const POSTURES: RiskPosture[] = ["raw", "bias", "p90", "p95"];

/** Re-runs the canonical scenario under each hedging posture to show the short-vs-long trade-off. */
export function usePostureComparison(baseline: DashboardResponse | null) {
  const [rows, setRows] = useState<Partial<Record<RiskPosture, DashboardMeta>>>({});
  useEffect(() => {
    if (!baseline) return;
    const ctrl = new AbortController();
    Promise.all(POSTURES.map((risk_posture) => api.dashboard({ ...baseline.meta, risk_posture }, ctrl.signal)))
      .then((res) => setRows(Object.fromEntries(res.map((r) => [r.meta.risk_posture, r.meta]))))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [baseline]);
  return rows;
}

export function ClientBriefingTab({ baseline }: { baseline: DashboardResponse | null }) {
  const postures = usePostureComparison(baseline);

  const gapData = useMemo(
    () =>
      (baseline?.timeseries ?? []).map((p) => {
        const over = p.forecast_mw != null && p.actual_mw != null && p.forecast_mw > p.actual_mw;
        return {
          startTime: p.startTime,
          actual: p.actual_mw,
          forecast: p.forecast_mw,
          shortGap: over ? [p.actual_mw, p.forecast_mw] : null,
          surplusGap: !over && p.forecast_mw != null && p.actual_mw != null ? [p.forecast_mw, p.actual_mw] : null,
        };
      }),
    [baseline],
  );

  if (!baseline) return <p className="animate-pulse py-24 text-center text-sm text-ink-3">Preparing the January 2026 briefing…</p>;
  const { kpis, meta } = baseline;
  const hz = baseline.horizon_accuracy.filter((b) => b.sample_count > 0);
  const near = hz[0];
  const far = hz[hz.length - 1];
  const growth = near?.mae_mw && far?.mae_mw ? (100 * (far.mae_mw - near.mae_mw)) / near.mae_mw : null;
  const worstHour = [...baseline.diurnal_profile].filter((d) => d.mae_mw != null).sort((a, b) => (b.mae_mw ?? 0) - (a.mae_mw ?? 0))[0];
  const calib2436 = baseline.calibration.find((c) => c.bucket_label === "24-36h");
  const worst = gapData.find((d) => d.startTime === kpis.max_overforecast_time);
  const maxSide = Math.max(1, ...POSTURES.map((p) => Math.max(postures[p]?.total_residual_shortfall_mwh ?? 0, postures[p]?.total_over_procured_mwh ?? 0)));

  return (
    <article className="space-y-6">
      <section className="panel isobars overflow-hidden">
        <div className="px-6 pb-2 pt-8 sm:px-10">
          <p className="text-[14px] text-ink-2">Pilot findings for the day-ahead desk: every purchase decision made in January 2026</p>
          <h2 className="font-expanded mt-3 max-w-[22ch] text-[34px] font-bold leading-[1.08] text-ink sm:text-[46px]">
            The wind forecast promised an average of {fmtMW(kpis.mbe_mw)} MW more than the turbines delivered.
          </h2>
          <p className="mt-4 max-w-[64ch] text-[16px] leading-relaxed text-ink-2">
            We replayed each day-ahead decision with the forecast that was actually on screen before the 11:00 auction, then compared it with metered
            output from Elexon. On average it was too high, in {fmtPct(kpis.shortfall_period_pct, 0)} of all {kpis.sample_count.toLocaleString("en-GB")} half-hours.
          </p>
        </div>

        <figure className="px-2 sm:px-6">
          <div className="draw-in h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={gapData} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
                <XAxis dataKey="startTime" tickFormatter={(v) => fmtTime(v).split(" ").slice(0, 2).join(" ")} minTickGap={64} tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#D5DEE8" }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)} GW`} width={52} tickLine={false} axisLine={false} />
                <Tooltip
                  content={
                    <ChartTooltip
                      title={(l) => `${fmtTime(String(l))} UTC`}
                      rows={(p) => {
                        const d = p[0].payload as { actual: number; forecast: number };
                        return [
                          { name: "Forecast at the cutoff", value: `${fmtMW(d.forecast)} MW`, color: COLORS.forecast },
                          { name: "Actual", value: `${fmtMW(d.actual)} MW`, color: COLORS.actual },
                          { name: "Gap", value: `${fmtSigned(d.forecast - d.actual)} MW`, color: d.forecast > d.actual ? COLORS.shortfall : COLORS.actual },
                        ];
                      }}
                    />
                  }
                />
                <Area dataKey="shortGap" name="Shortfall" stroke="none" fill={COLORS.shortfall} fillOpacity={0.32} isAnimationActive={false} />
                <Area dataKey="surplusGap" name="Surplus" stroke="none" fill={COLORS.actual} fillOpacity={0.22} isAnimationActive={false} />
                <Line dataKey="actual" name="Actual" stroke={COLORS.actual} strokeWidth={1.6} dot={false} isAnimationActive={false} />
                <Line dataKey="forecast" name="Forecast" stroke={COLORS.forecast} strokeWidth={1.6} dot={false} isAnimationActive={false} />
                {worst && (
                  <ReferenceDot
                    x={worst.startTime}
                    y={worst.forecast ?? 0}
                    r={5}
                    fill="#fff"
                    stroke={COLORS.shortfall}
                    strokeWidth={2.5}
                    label={{ value: `${fmtMW(kpis.max_overforecast_mw)} MW short, ${fmtTime(kpis.max_overforecast_time)}`, position: "top", fill: COLORS.shortfall, fontSize: 12, fontWeight: 600 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <figcaption className="flex flex-wrap gap-x-6 gap-y-1 px-4 pb-6 pt-2 text-[13px] text-ink-2 sm:px-4">
            <Key color={COLORS.forecast} line>
              Forecast at D-1 10:00
            </Key>
            <Key color={COLORS.actual} line>
              Actual wind (FUELHH)
            </Key>
            <Key color={COLORS.shortfall}>Forecast too high: the desk is short</Key>
            <Key color={COLORS.actual}>Forecast too low: the desk is long</Key>
          </figcaption>
        </figure>

        <dl className="grid grid-cols-2 border-t border-rule bg-white/70 lg:grid-cols-4">
          <Fact value={`${fmtMW(kpis.mae_mw)} MW`} label="Typical miss per half-hour" />
          <Fact value={fmtPct(kpis.shortfall_period_pct, 0)} label="Half-hours where the forecast was too high" />
          <Fact value={`${fmtMW(kpis.p90_shortfall_buffer_mw)} MW`} label="Extra cover needed for 9 in 10 periods" />
          <Fact value={`+${fmtPct(growth, 0)}`} label={`Bigger miss at ${far?.bucket_label} than at ${near?.bucket_label}`} />
        </dl>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="panel p-6 sm:p-8">
          <Step n={1} title="What the bias cost the desk" />
          <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-ink-2">
            The same decisions, at {fmtMW(meta.demand_mw)} MW of demand, made four ways. Bars to the left are energy left short and bought at imbalance prices.
            Bars to the right are thermal that the wind made unnecessary.
          </p>
          <div className="mt-6 space-y-4" aria-label="Posture trade-off">
            {POSTURES.map((p) => {
              const m = postures[p];
              const short = m?.total_residual_shortfall_mwh ?? 0;
              const long = m?.total_over_procured_mwh ?? 0;
              const net = m ? (m.total_recommended_thermal_mwh ?? 0) - (m.total_actual_thermal_needed_mwh ?? 0) : null;
              return (
                <div key={p}>
                  <div className="mb-1.5 flex items-baseline justify-between text-[14px]">
                    <span className={`font-medium ${p === "bias" ? "text-fcst" : "text-ink"}`}>
                      {POSTURE_LABEL[p]}
                      {p === "bias" && <span className="ml-2 rounded-full bg-fcst/10 px-2 py-0.5 text-[12px]">Balanced</span>}
                    </span>
                    <span className="num text-[13px] text-ink-2">net {net == null ? "—" : `${net > 0 ? "+" : ""}${fmtGWh(net, 0)}`}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <div className="flex h-7 items-center justify-end rounded-l-md bg-paper">
                      <div className="flex h-full items-center justify-end rounded-l-md bg-short/85 pr-2 transition-all duration-500" style={{ width: `${(100 * short) / maxSide}%` }}>
                        {short / maxSide > 0.28 && <span className="num text-[12px] font-medium text-white">{fmtGWh(short, 0)}</span>}
                      </div>
                      {short / maxSide <= 0.28 && <span className="num order-first pr-2 text-[12px] text-short">{m ? fmtGWh(short, 0) : ""}</span>}
                    </div>
                    <div className="flex h-7 items-center rounded-r-md bg-paper">
                      <div className="flex h-full items-center rounded-r-md bg-long/80 pl-2 transition-all duration-500" style={{ width: `${(100 * long) / maxSide}%` }}>
                        {long / maxSide > 0.28 && <span className="num text-[12px] font-medium text-white">{fmtGWh(long, 0)}</span>}
                      </div>
                      {long / maxSide <= 0.28 && <span className="num pl-2 text-[12px] text-long">{m ? fmtGWh(long, 0) : ""}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-2 gap-1 text-[12px] text-ink-3">
              <span className="text-right">Left short</span>
              <span>Over-bought</span>
            </div>
          </div>
        </div>

        <div className="panel p-6 sm:p-8">
          <Step n={2} title="Where the risk concentrates" />
          <ul className="mt-4 space-y-5 text-[15px] leading-relaxed text-ink-2">
            <li>
              <strong className="text-ink">Lead time.</strong> The typical miss is {fmtMW(near?.mae_mw)} MW four hours out and {fmtMW(far?.mae_mw)} MW two days out.
              Day-ahead decisions sit about {kpis.avg_lead_time_hours?.toFixed(0)} hours ahead, so late revisions are worth re-trading intraday.
            </li>
            <li>
              <strong className="text-ink">Time of day.</strong> Error peaks around {worstHour?.label} UTC (typical miss {fmtMW(worstHour?.mae_mw)} MW), overnight rather than at the evening peak.
            </li>
            <li>
              <strong className="text-ink">Single events.</strong> The worst half-hour was {fmtTime(kpis.max_overforecast_time)}, when the forecast on screen at the cutoff was{" "}
              {fmtMW(kpis.max_overforecast_mw)} MW too high.
            </li>
          </ul>
        </div>
      </section>

      <section className="panel p-6 sm:p-8">
        <Step n={3} title="What we recommend" />
        <div className="mt-5 grid gap-6 md:grid-cols-3">
          <Rec title="Trade the de-biased forecast by default">
            Take the typical error off before bidding: about {fmtMW(calib2436?.q50)} MW for forecasts 24–36 hours ahead. In January this alone would have cut the short
            position from {fmtGWh(postures.raw?.total_residual_shortfall_mwh, 0)} to {fmtGWh(postures.bias?.total_residual_shortfall_mwh, 0)}.
          </Rec>
          <Rec title="Switch to P90 when imbalance prices look tight">
            A {fmtMW(calib2436?.q90)} MW haircut at the same lead time covers 9 in 10 shortfalls. It costs more thermal, so reserve it for cold, still, high-price days.
          </Rec>
          <Rec title="Bid half-hour by half-hour, and re-check late">
            The bid schedule exports straight to your bid sheet. Moving the decision from 10:00 to 16:00 on D-1 would have reduced the typical miss, so re-check
            positions against the afternoon runs.
          </Rec>
        </div>
        <p className="mt-6 border-t border-rule pt-4 text-[13px] text-ink-3">
          Next in the pilot: solar and demand forecasts on the same engine, buffers recalibrated on a rolling window, and imbalance prices so the trade-off is in pounds.
        </p>
      </section>
    </article>
  );
}

function Key({ color, line, children }: { color: string; line?: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className={line ? "h-[3px] w-5 rounded-full" : "h-3 w-3 rounded-sm opacity-60"} style={{ background: color }} />
      {children}
    </span>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-r border-rule px-6 py-5 last:border-r-0 sm:px-10 [&:nth-child(2)]:border-r-0 lg:[&:nth-child(2)]:border-r">
      <dd className="num font-expanded text-[26px] font-bold text-ink">{value}</dd>
      <dt className="mt-1 text-[13px] leading-snug text-ink-2">{label}</dt>
    </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h3 className="flex items-center gap-3">
      <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-[14px] font-semibold text-white">{n}</span>
      <span className="font-semi-expanded text-[20px] font-semibold text-ink">{title}</span>
    </h3>
  );
}

function Rec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-fcst pl-4">
      <h4 className="font-semi-expanded text-[16px] font-semibold text-ink">{title}</h4>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{children}</p>
    </div>
  );
}
