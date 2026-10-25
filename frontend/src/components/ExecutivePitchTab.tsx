import { AlertTriangle, CheckCircle2, Clock, Database, Layers, Server, ShieldCheck, TrendingUp } from "lucide-react";
import type { DashboardResponse, HealthResponse } from "../types/api";
import { fmtGWh, fmtMW, fmtPct, fmtSigned, fmtTime } from "../lib/format";

interface Props {
  baseline: DashboardResponse | null;
  health: HealthResponse | null;
}

export function ExecutivePitchTab({ baseline, health }: Props) {
  if (!baseline) return <p className="animate-pulse text-sm text-slate-400">Computing January 2026 findings…</p>;
  const { kpis, meta } = baseline;
  const hz = baseline.horizon_accuracy.filter((b) => b.sample_count > 0);
  const short = hz[0];
  const long = hz[hz.length - 1];
  const worstHour = [...baseline.diurnal_profile].filter((d) => d.mae_mw != null).sort((a, b) => (b.mae_mw ?? 0) - (a.mae_mw ?? 0))[0];
  const bestHour = [...baseline.diurnal_profile].filter((d) => d.mae_mw != null).sort((a, b) => (a.mae_mw ?? 0) - (b.mae_mw ?? 0))[0];
  const worstDay = [...baseline.daily_summary].sort((a, b) => (b.mae_mw ?? 0) - (a.mae_mw ?? 0))[0];
  const p90 = baseline.calibration.find((c) => c.bucket_label === "24-36h");

  const findings = [
    {
      icon: AlertTriangle,
      tone: "text-rose-300",
      title: "Forecasts are systematically optimistic",
      body: `The wind forecast available at 10:00 on D-1 over-stated metered wind by ${fmtSigned(kpis.mbe_mw)} MW on average and was too high in ${fmtPct(kpis.shortfall_period_pct, 0)} of January's ${kpis.sample_count.toLocaleString("en-GB")} settlement periods. Bias, not noise, is most of the ${fmtMW(kpis.mae_mw)} MW MAE.`,
    },
    {
      icon: ShieldCheck,
      tone: "text-amber-300",
      title: `Hold ≈${fmtMW(kpis.p90_shortfall_buffer_mw)} MW of P90 shortfall cover`,
      body: `Buying ${fmtMW(kpis.p90_shortfall_buffer_mw)} MW of extra thermal (P90) means wind under-delivery exceeded the buffer in only 1 period in 10; ${fmtMW(kpis.p95_shortfall_buffer_mw)} MW covers 19 in 20. Over January the P90 posture buys ${fmtGWh(meta.total_recommended_thermal_mwh)} day-ahead and leaves ${fmtGWh(meta.total_residual_shortfall_mwh)} to the imbalance market.`,
    },
    {
      icon: Clock,
      tone: "text-sky-300",
      title: "Lead time costs accuracy",
      body: `MAE rises from ${fmtMW(short?.mae_mw)} MW at ${short?.bucket_label} to ${fmtMW(long?.mae_mw)} MW at ${long?.bucket_label} (RMSE ${fmtMW(short?.rmse_mw)} → ${fmtMW(long?.rmse_mw)} MW). Day-ahead decisions sit at ~${kpis.avg_lead_time_hours?.toFixed(0)}h lead, so intraday re-trading of late forecast revisions has measurable value.`,
    },
    {
      icon: TrendingUp,
      tone: "text-emerald-300",
      title: "Know when to worry",
      body: `Error peaks around ${worstHour?.label} UTC (MAE ${fmtMW(worstHour?.mae_mw)} MW) and is lowest around ${bestHour?.label} (${fmtMW(bestHour?.mae_mw)} MW). The worst single period was ${fmtTime(kpis.max_overforecast_time)} (${fmtMW(kpis.max_overforecast_mw)} MW short); the worst delivery day was ${worstDay?.date} (MAE ${fmtMW(worstDay?.mae_mw)} MW).`,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500/10 via-sky-500/10 to-transparent p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Pilot findings · January 2026 day-ahead decisions</p>
          <h2 className="mt-2 max-w-3xl text-2xl font-bold tracking-tight text-white">
            The wind forecast you trade on was {fmtMW(kpis.mae_mw)} MW off on average, and {fmtPct(kpis.shortfall_period_pct, 0)} of the time it was too high.
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            WindSight replays every D-1 decision in January 2026 with exactly the forecast that was published before gate closure,
            measures how wrong it was against Elexon outturn, and converts that error into a thermal procurement buffer.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Big label="Mean abs error" value={`${fmtMW(kpis.mae_mw)} MW`} />
            <Big label="Mean bias" value={`${fmtSigned(kpis.mbe_mw)} MW`} tone="text-rose-300" />
            <Big label="P90 buffer" value={`${fmtMW(kpis.p90_shortfall_buffer_mw)} MW`} tone="text-amber-300" />
            <Big label="P95 buffer" value={`${fmtMW(kpis.p95_shortfall_buffer_mw)} MW`} tone="text-amber-300" />
            <Big label="Avg wind / peak" value={`${fmtMW(kpis.avg_actual_mw)} / ${fmtMW(kpis.peak_actual_mw)} MW`} tone="text-emerald-300" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {findings.map(({ icon: Icon, tone, title, body }) => (
          <div key={title} className="card p-5">
            <div className="flex items-center gap-2">
              <Icon className={`h-5 w-5 ${tone}`} />
              <h3 className="font-semibold text-white">{title}</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{body}</p>
          </div>
        ))}
      </section>

      <section className="card p-5">
        <h3 className="font-semibold text-white">Operational recommendations for the trading desk</h3>
        <ol className="mt-3 space-y-2 text-sm text-slate-300">
          {[
            `Never buy against the raw WINDFOR number. Use the P90 relied-upon wind on the Procurement Desk; for 24–36h-ahead forecasts that means a ${fmtMW(p90?.q90)} MW haircut.`,
            "Size the day-ahead thermal buy per settlement period from the 48-SP schedule (CSV export feeds straight into the bid sheet).",
            `Use a later cutoff where the auction allows: the 24–36h bucket's MAE is ${fmtMW(baseline.horizon_accuracy.find((b) => b.bucket_label === "24-36h")?.mae_mw)} MW vs ${fmtMW(baseline.horizon_accuracy.find((b) => b.bucket_label === "12-18h")?.mae_mw)} MW at 12–18h.`,
            `Watch the ${worstHour?.label} UTC window: that's where forecast error peaks, so it carries the highest imbalance exposure.`,
            "Re-calibrate the buffers monthly. The engine recomputes everything from a fresh Elexon pull (POST /api/v1/system/refresh).",
          ].map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className="num mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-[11px] text-emerald-300">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </section>

      <section className="card p-5">
        <h3 className="font-semibold text-white">Architecture &amp; data lineage (tech-lead view)</h3>
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <Box icon={Database} title="Elexon BMRS (public)" tone="border-slate-700">
            <code>FUELHH/stream</code> fuelType=WIND (30-min outturn)
            <br />
            <code>WINDFOR/stream</code> every publish run, 0–72h
            <br />
            Chunked 5–7 day pulls, retries + backoff
          </Box>
          <Box icon={Layers} title="Snapshot + DataStore" tone="border-emerald-800">
            {health ? (
              <>
                <span className="num">{health.actuals_count.toLocaleString("en-GB")}</span> actuals ·{" "}
                <span className="num">{health.forecasts_raw_count.toLocaleString("en-GB")}</span> forecasts ·{" "}
                <span className="num">{health.publish_runs}</span> runs
              </>
            ) : (
              "loading…"
            )}
            <br />
            gzip JSON (deterministic), pandas frames in memory, hourly → 30-min interpolation per run
          </Box>
          <Box icon={Server} title="FastAPI analytics engine" tone="border-sky-800">
            As-of join (publishTime ≤ cutoff, max) · MAE/RMSE/MBE/MAPE · quantiles · horizon buckets · thermal calc
            <br />
            <code>/api/v1/dashboard</code> ~60 ms full month
          </Box>
          <Box icon={TrendingUp} title="React + Recharts SPA" tone="border-amber-800">
            Typed client mirrors Pydantic schemas · 3 workspaces · CSV export · revision inspector
            <br />
            Served by FastAPI (Docker/Heroku) or Vercel CDN + Python function
          </Box>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-300">
            <p className="mb-2 font-semibold text-slate-100">Core formulas</p>
            <p className="num">e = forecast − actual   (e &gt; 0 ⇒ wind shortfall)</p>
            <p className="num">D-1 mode: ŷ*(t) = argmax_pub {"{"}pub ≤ date(t) − 1d + cutoff{"}"}</p>
            <p className="num">Horizon mode: t − 48h ≤ pub ≤ t − H_min</p>
            <p className="num">MAPE = mean(|e| / max(y, 100 MW))</p>
            <p className="num">B90 = max(0, P90(e)),  B95 = max(0, P95(e))</p>
            <p className="num">relied wind = max(0, ŷ − max(0, q90[bucket(h)]))</p>
            <p className="num">thermal buy = max(0, demand − relied wind);  MWh = MW × 0.5h</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-300">
            <p className="mb-2 font-semibold text-slate-100">Engineering practices</p>
            {[
              "Point-in-time correctness: no forecast published after the decision cutoff is ever used (property-tested on real data).",
              "Deterministic snapshot → reproducible numbers in the demo, tests and every deployment; live refresh endpoint for new data.",
              "36 pytest cases: synthetic-vector maths, as-of invariants, data integrity, API contract + error handling.",
              "Vitest component tests; strict TypeScript; Pydantic response models are the single API contract.",
              "One multi-stage Dockerfile serves SPA + API; same code runs on Vercel (api/index.py) and Heroku (Procfile).",
            ].map((t) => (
              <p key={t} className="mb-1.5 flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                {t}
              </p>
            ))}
          </div>
        </div>
        <p className="mt-4 text-[11px] text-slate-500">
          Scope note: actuals are transmission-metered FUELHH wind only; WINDFOR targets the same metered fleet. Buffers are calibrated
          in-sample on January 2026; in production they would use a trailing window. Snapshot fetched {health?.fetched_at_utc ?? "—"}.
        </p>
      </section>
    </div>
  );
}

function Big({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`num mt-1 text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function Box({ icon: Icon, title, tone, children }: { icon: typeof Database; title: string; tone: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border ${tone} bg-slate-950/60 p-4`}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
        <Icon className="h-4 w-4 text-slate-400" /> {title}
      </div>
      <div className="text-xs leading-relaxed text-slate-400 [&_code]:text-sky-300">{children}</div>
    </div>
  );
}
