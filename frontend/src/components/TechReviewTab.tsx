import { useEffect, useMemo, useState } from "react";
import { api } from "../services/apiClient";
import type { DashboardResponse, ForecastEvolutionResponse, HealthResponse } from "../types/api";
import { COLORS, fmtMW, fmtSigned, fmtTime } from "../lib/format";

interface Props {
  baseline: DashboardResponse | null;
  health: HealthResponse | null;
}

export function TechReviewTab({ baseline, health }: Props) {
  return (
    <div className="space-y-6">
      <section className="panel p-6 sm:p-8">
        <h2 className="font-expanded text-[28px] font-bold leading-tight text-ink sm:text-[34px]">How WindSight works</h2>
        <p className="mt-3 max-w-[78ch] text-[15px] leading-relaxed text-ink-2">
          A Python ingestion script pulls two public Elexon datasets into a deterministic snapshot. A FastAPI service loads it into pandas and computes every
          metric per request. A typed React client renders the result. The rule that matters most: no forecast published after the decision cutoff is ever
          used. This is enforced in one vectorised function and tested against the real data.
        </p>
        <Pipeline health={health} baseline={baseline} />
      </section>

      <LookAheadTimeline />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <ApiExplorer />
        <MetricReference />
      </div>

      <QualityEvidence />
    </div>
  );
}

/* ------------------------------------------------------------------ pipeline */

function Pipeline({ health, baseline }: Props) {
  const stages = useMemo(
    () => [
      {
        id: "source",
        name: "Elexon BMRS",
        sub: "Public API, no key",
        file: "data.elexon.co.uk/bmrs/api/v1",
        body: [
          "FUELHH/stream: half-hourly outturn by fuel type, filtered to WIND.",
          "WINDFOR/stream: every forecast run with its publishTime, hourly resolution.",
          "Scope: delivery 1 Jan – 1 Feb 2026, forecast runs published from 29 Dec 2025 so the earliest decisions have 48 h of history.",
        ],
      },
      {
        id: "ingest",
        name: "Ingestion",
        sub: "bmrs_client.py",
        file: "backend/bmrs_client.py · backend/scripts/fetch_bmrs_data.py",
        body: [
          "Requests are chunked into 5–7 day windows with a 0.25 s pause between them.",
          "Retries with exponential backoff on network errors, 429 and 5xx.",
          "Normalises timestamps to UTC, keeps 0–72 h horizons, deduplicates on (publishTime, startTime) and checks row counts before writing.",
        ],
      },
      {
        id: "snapshot",
        name: "Snapshot",
        sub: "gzip JSON, 139 KB",
        file: "backend/data/jan2026_bmrs_cache.json.gz",
        body: [
          health
            ? `${health.actuals_count.toLocaleString("en-GB")} actuals, ${health.forecasts_raw_count.toLocaleString("en-GB")} forecast rows, ${health.publish_runs} runs. Fetched ${health.fetched_at_utc}.`
            : "Loading counts…",
          "Written with a fixed gzip mtime, so identical data gives identical bytes and every environment shows the same numbers.",
          "POST /api/v1/system/refresh re-fetches live and swaps the data in under a lock.",
        ],
      },
      {
        id: "engine",
        name: "Analytics engine",
        sub: "pandas · NumPy",
        file: "backend/data_store.py · backend/analytics.py",
        body: [
          health ? `Hourly WINDFOR is interpolated to 30 minutes within each run: ${health.forecasts_half_hourly_count.toLocaleString("en-GB")} rows in memory.` : "Interpolates hourly WINDFOR to 30 minutes within each run.",
          "As-of selection, error metrics, lead-time buckets, quantile calibration and the procurement maths.",
          "Calibration tables are cached per data version.",
        ],
      },
      {
        id: "api",
        name: "REST API",
        sub: "FastAPI · Pydantic v2",
        file: "backend/main.py · backend/schemas.py · api/index.py",
        body: [
          "Four endpoints under /api/v1, each with a typed response model. Interactive docs are at /docs.",
          baseline ? `The full-window dashboard returns ${baseline.timeseries.length.toLocaleString("en-GB")} half-hours, gzip-compressed.` : "Gzip-compressed responses.",
          "Out-of-window dates return 400 with a reason, and bad enum values return 422.",
        ],
      },
      {
        id: "ui",
        name: "React client",
        sub: "TypeScript · Recharts",
        file: "frontend/src",
        body: [
          "types/api.ts mirrors the Pydantic models, so the contract is checked at compile time.",
          "Requests are debounced and cancelled with AbortController when controls change.",
          "Served by FastAPI in Docker and Heroku; on Vercel from the CDN, with the API as a Python function.",
        ],
      },
    ],
    [health, baseline],
  );
  const [active, setActive] = useState("engine");
  const stage = stages.find((s) => s.id === active)!;

  return (
    <div className="mt-8">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Data pipeline">
        {stages.map((s, i) => (
          <li key={s.id} className="relative">
            <button
              onClick={() => setActive(s.id)}
              aria-pressed={active === s.id}
              className={`h-full w-full rounded-xl px-3.5 py-3 text-left ring-1 transition-colors ${
                active === s.id ? "bg-ink text-panel ring-ink" : "bg-paper text-ink ring-rule hover:bg-panel"
              }`}
            >
              <span className={`num text-[11px] ${active === s.id ? "text-panel/60" : "text-ink-3"}`}>Step {i + 1}</span>
              <span className="mt-0.5 block text-[14px] font-semibold">{s.name}</span>
              <span className={`block text-[12px] ${active === s.id ? "text-panel/70" : "text-ink-2"}`}>{s.sub}</span>
            </button>
            {i < stages.length - 1 && (
              <span className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 text-ink-3 lg:block" aria-hidden>
                ›
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-3 rounded-xl bg-paper px-5 py-4 ring-1 ring-rule">
        <code className="text-[12px] text-fcst">{stage.file}</code>
        <ul className="mt-2 space-y-1.5 text-[14px] leading-relaxed text-ink-2">
          {stage.body.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
              {b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- no look-ahead */

const TIMELINE_TARGET = "2026-01-12T01:00:00Z";

function LookAheadTimeline() {
  const [data, setData] = useState<ForecastEvolutionResponse | null>(null);
  const [cutoffHour, setCutoffHour] = useState(10);

  useEffect(() => {
    const ctrl = new AbortController();
    api.forecastEvolution(TIMELINE_TARGET, 10, ctrl.signal).then(setData).catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  const target = Date.parse(TIMELINE_TARGET);
  const dayStart = Date.parse(TIMELINE_TARGET.slice(0, 10) + "T00:00:00Z");
  const cutoff = dayStart - 24 * 3600e3 + cutoffHour * 3600e3;
  const revisions = data?.revisions ?? [];
  const eligible = revisions.filter((r) => Date.parse(r.publishTime) <= cutoff);
  const chosen = eligible[eligible.length - 1];

  // Plot geometry: x = publish time over the 50 h before delivery, y = forecast MW.
  const W = 920;
  const H = 260;
  const pad = { l: 56, r: 24, t: 24, b: 36 };
  const x0 = target - 50 * 3600e3;
  const xs = (t: number) => pad.l + ((t - x0) / (target - x0)) * (W - pad.l - pad.r);
  const vals = revisions.map((r) => r.forecast_mw ?? 0).concat(data?.actual_mw ?? 0);
  const yMin = Math.floor((Math.min(...vals, 0) - 500) / 1000) * 1000;
  const yMax = Math.ceil((Math.max(...vals, 1000) + 500) / 1000) * 1000;
  const ys = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
  const ticksY = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);

  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="font-semi-expanded text-[20px] font-semibold text-ink">No look-ahead: which forecast did the desk really have?</h3>
          <p className="mt-1 max-w-[80ch] text-[14px] leading-relaxed text-ink-2">
            Every WINDFOR run for delivery at {fmtTime(TIMELINE_TARGET)} UTC, the month's worst shortfall. Move the cutoff: runs to the right of it are in the
            future and cannot be used. The engine picks the latest run on the left.
          </p>
        </div>
        <label className="w-full max-w-xs text-[13px] text-ink-2">
          <span className="flex justify-between">
            Decision cutoff on D-1
            <span className="num font-semibold text-ink">{String(cutoffHour).padStart(2, "0")}:00 UTC</span>
          </span>
          <input type="range" min={0} max={23} value={cutoffHour} onChange={(e) => setCutoffHour(Number(e.target.value))} className="mt-1 w-full" aria-label="Timeline cutoff hour" />
        </label>
      </div>

      {data ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_260px]">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Forecast runs against the decision cutoff">
            <rect x={xs(cutoff)} y={pad.t} width={W - pad.r - xs(cutoff)} height={H - pad.t - pad.b} fill="var(--c-ink)" opacity={0.06} />
            {ticksY.map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={ys(v)} y2={ys(v)} stroke="var(--c-grid)" />
                <text x={pad.l - 8} y={ys(v) + 4} textAnchor="end" className="num" fontSize="11" fill="var(--c-ink-3)">
                  {(v / 1000).toFixed(0)} GW
                </text>
              </g>
            ))}
            {[48, 36, 24, 12, 0].map((h) => (
              <text key={h} x={xs(target - h * 3600e3)} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--c-ink-3)">
                {h === 0 ? "delivery" : `−${h} h`}
              </text>
            ))}
            {data.actual_mw != null && (
              <>
                <line x1={pad.l} x2={W - pad.r} y1={ys(data.actual_mw)} y2={ys(data.actual_mw)} stroke={COLORS.actual} strokeWidth={2} strokeDasharray="6 4" />
                <text x={pad.l + 6} y={ys(data.actual_mw) - 6} fontSize="12" fill={COLORS.actual} fontWeight={600}>
                  Actual {fmtMW(data.actual_mw)} MW
                </text>
              </>
            )}
            <polyline
              fill="none"
              stroke={COLORS.forecast}
              strokeOpacity={0.35}
              strokeWidth={1.5}
              points={revisions.map((r) => `${xs(Date.parse(r.publishTime))},${ys(r.forecast_mw ?? 0)}`).join(" ")}
            />
            {revisions.map((r) => {
              const t = Date.parse(r.publishTime);
              const usable = t <= cutoff;
              const isChosen = r === chosen;
              return (
                <g key={r.publishTime}>
                  {isChosen && <line x1={xs(t)} x2={xs(t)} y1={ys(r.forecast_mw ?? 0)} y2={ys(data.actual_mw ?? 0)} stroke={COLORS.shortfall} strokeWidth={2} />}
                  <circle
                    cx={xs(t)}
                    cy={ys(r.forecast_mw ?? 0)}
                    r={isChosen ? 7 : 4.5}
                    fill={usable ? COLORS.forecast : "#fff"}
                    stroke={isChosen ? COLORS.thermal : COLORS.forecast}
                    strokeWidth={isChosen ? 3 : 1.5}
                    opacity={usable ? 1 : 0.55}
                  >
                    <title>{`${fmtTime(r.publishTime)}: ${fmtMW(r.forecast_mw)} MW, ${r.horizon_hours} h ahead`}</title>
                  </circle>
                </g>
              );
            })}
            <line x1={xs(cutoff)} x2={xs(cutoff)} y1={pad.t - 8} y2={H - pad.b} stroke={COLORS.ink} strokeWidth={2} />
            <text x={xs(cutoff) + 6} y={pad.t + 4} fontSize="12" fill={COLORS.ink} fontWeight={600}>
              cutoff
            </text>
            <text x={W - pad.r - 6} y={pad.t + 18} textAnchor="end" fontSize="11" fill="var(--c-ink-3)">
              not yet published
            </text>
          </svg>
          <dl className="space-y-3 text-[14px]">
            <div>
              <dt className="text-[12px] text-ink-2">Runs available / total</dt>
              <dd className="num font-semi-expanded text-[22px] font-semibold text-ink">
                {eligible.length} / {revisions.length}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-2">Run the engine selects</dt>
              <dd className="num font-semibold text-ink">{chosen ? `${fmtTime(chosen.publishTime)}, ${chosen.horizon_hours} h ahead` : "None within 48 h"}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-2">Its forecast</dt>
              <dd className="num font-semibold text-ink">{chosen ? `${fmtMW(chosen.forecast_mw)} MW` : "—"}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-2">Error the desk faced</dt>
              <dd className="figure font-semi-expanded flex items-center gap-2 text-[22px] font-semibold text-ink">
                {chosen && <span className={`h-2.5 w-2.5 rounded-full ${(chosen.error_mw ?? 0) > 0 ? "bg-short" : "bg-long"}`} aria-hidden />}
                {chosen ? `${fmtSigned(chosen.error_mw)} MW` : "—"}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="mt-6 animate-pulse text-sm text-ink-3">Loading forecast runs…</p>
      )}

      <pre className="mt-6 overflow-x-auto rounded-xl code-block p-4 text-[12px] leading-relaxed">
        <code>{`# simplified from backend/analytics.py · select_as_of_forecasts (day_ahead_cutoff mode)
cutoff   = cand["startTime"].dt.floor("D") - pd.Timedelta(days=1) + pd.Timedelta(hours=cutoff_hour_utc)
eligible = cand["publishTime"] <= cutoff                     # drop anything published after the decision
best     = cand[eligible].loc[lambda d: d.groupby("startTime")["publishTime"].idxmax()]   # latest usable run`}</code>
      </pre>
    </section>
  );
}

/* ------------------------------------------------------------- API explorer */

const ENDPOINTS = [
  { id: "health", label: "GET /health", url: "/api/v1/health" },
  { id: "dashboard", label: "GET /dashboard", url: "/api/v1/dashboard?start_date=2026-01-02&end_date=2026-02-01&risk_posture=bias" },
  { id: "evolution", label: "GET /forecast-evolution", url: "/api/v1/forecast-evolution?target_time=2026-01-12T01:00:00Z" },
  { id: "bad", label: "GET /dashboard, bad date", url: "/api/v1/dashboard?start_date=2025-11-01" },
] as const;

function trimForDisplay(body: unknown): unknown {
  if (Array.isArray(body)) return body.length > 3 ? [...body.slice(0, 2), `… ${body.length - 2} more`] : body;
  if (body && typeof body === "object") return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, trimForDisplay(v)]));
  return body;
}

function ApiExplorer() {
  const [sel, setSel] = useState<(typeof ENDPOINTS)[number]["id"]>("health");
  const [res, setRes] = useState<{ status: number; ms: number; bytes: number; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const ep = ENDPOINTS.find((e) => e.id === sel)!;

  const run = async () => {
    setBusy(true);
    const t0 = performance.now();
    try {
      const r = await fetch(ep.url);
      const text = await r.text();
      const ms = performance.now() - t0;
      let body = text;
      try {
        body = JSON.stringify(trimForDisplay(JSON.parse(text)), null, 2);
      } catch {
        /* keep raw text */
      }
      setRes({ status: r.status, ms, bytes: new Blob([text]).size, body });
    } catch (e) {
      setRes({ status: 0, ms: performance.now() - t0, bytes: 0, body: String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel flex min-w-0 flex-col p-6">
      <h3 className="font-semi-expanded text-[18px] font-semibold text-ink">Live API</h3>
      <p className="mt-1 text-[14px] text-ink-2">Call the running backend from here. Long arrays are shortened in the preview, but the timing is for the full response.</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {ENDPOINTS.map((e) => (
          <button
            key={e.id}
            onClick={() => {
              setSel(e.id);
              setRes(null);
            }}
            aria-pressed={sel === e.id}
            className={`rounded-lg px-2.5 py-1.5 text-[13px] ring-1 ${sel === e.id ? "bg-ink text-panel ring-ink" : "bg-panel text-ink-2 ring-rule hover:text-ink"}`}
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-paper px-3 py-2 text-[12px] text-ink-2 ring-1 ring-rule">{ep.url}</code>
        <button onClick={run} disabled={busy} className="rounded-lg bg-fcst px-4 py-2 text-[13px] font-semibold text-panel hover:bg-fcst/90 disabled:opacity-60">
          {busy ? "Sending…" : "Send request"}
        </button>
      </div>
      {res && (
        <div className="mt-3 flex gap-4 text-[13px]">
          <span className="num flex items-center gap-1.5 font-semibold text-ink">
            <span className={`h-2 w-2 rounded-full ${res.status >= 200 && res.status < 300 ? "bg-wind" : "bg-short"}`} aria-hidden />
            HTTP {res.status}
          </span>
          <span className="num text-ink-2">{res.ms.toFixed(0)} ms</span>
          <span className="num text-ink-2">{(res.bytes / 1024).toFixed(1)} KB</span>
        </div>
      )}
      <pre className="mt-3 max-h-80 min-h-[160px] flex-1 overflow-auto rounded-xl code-block p-4 text-[12px] leading-relaxed">
        <code>{res ? res.body : "Choose an endpoint and send a request."}</code>
      </pre>
    </section>
  );
}

/* ------------------------------------------------------------- definitions */

const METRICS: [string, string, string][] = [
  ["Error e", "forecast − actual", "Positive means wind under-delivered and the desk is short."],
  ["MAE", "mean |e|", "Typical size of a miss in MW."],
  ["RMSE", "√ mean e²", "Penalises large misses; RMSE ≫ MAE signals fat tails."],
  ["Bias (MBE)", "mean e", "Systematic over- or under-forecasting."],
  ["MAPE", "mean |e| / max(actual, 100 MW)", "Relative error; the floor stops wind lulls dominating."],
  ["P90 cover", "max(0, P90 of e)", "Extra MW that covers 9 in 10 shortfalls."],
  ["Relied wind", "max(0, ŷ − max(0, q[lead bucket]))", "q is q50, q90 or q95, depending on the posture."],
  ["Thermal buy", "max(0, demand − relied wind) × 0.5 h", "Per settlement period, in MWh."],
];

function MetricReference() {
  return (
    <section className="panel min-w-0 p-6">
      <h3 className="font-semi-expanded text-[18px] font-semibold text-ink">Definitions</h3>
      <p className="mt-1 text-[14px] text-ink-2">Every number on screen comes from one of these. Times are UTC, which is UK local time in January.</p>
      <div className="mt-4 overflow-x-auto">
      <table className="w-full text-[13px]">
        <tbody>
          {METRICS.map(([name, formula, why]) => (
            <tr key={name} className="border-t border-rule align-top">
              <th className="w-[110px] py-2 pr-3 text-left font-semibold text-ink">{name}</th>
              <td className="py-2 pr-3">
                <code className="whitespace-nowrap rounded bg-paper px-1.5 py-0.5 text-[12px] text-fcst">{formula}</code>
              </td>
              <td className="py-2 text-ink-2">{why}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- evidence */

const SUITES = [
  { file: "backend/tests/test_analytics.py", count: 20, what: "Selection invariants on real data, interpolation, metrics against hand-computed vectors, posture ordering, MWh reconciliation." },
  { file: "backend/tests/test_api.py", count: 15, what: "Every endpoint and parameter mode, schema shape, 400 on bad dates, 422 on bad enums, JSON 404s, cache headers." },
  { file: "backend/tests/test_data_integrity.py", count: 4, what: "Snapshot loads, 48 periods every delivery day, horizons within 0–72 h, a forecast run on every January decision day." },
  { file: "frontend/src/__tests__/App.test.tsx", count: 9, what: "Rendering, KPI values, controls reaching the API, the revision modal, tabs, theme toggle, shortcuts, table views, CSV export." },
];

function QualityEvidence() {
  return (
    <section className="panel p-6 sm:p-8">
      <h3 className="font-semi-expanded text-[20px] font-semibold text-ink">Verification</h3>
      <div className="mt-5 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <table className="w-full text-[14px]">
          <thead className="text-left text-[12px] text-ink-2">
            <tr>
              <th className="pb-2 font-medium">Suite</th>
              <th className="pb-2 text-right font-medium">Tests</th>
            </tr>
          </thead>
          <tbody>
            {SUITES.map((s) => (
              <tr key={s.file} className="border-t border-rule align-top">
                <td className="py-3 pr-4">
                  <code className="text-[12px] text-fcst">{s.file}</code>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{s.what}</p>
                </td>
                <td className="figure py-3 text-right font-semi-expanded text-[20px] font-semibold text-ink">{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-5 text-[14px] leading-relaxed text-ink-2">
          <div>
            <h4 className="font-semibold text-ink">One build, three runtimes</h4>
            <p className="mt-1">
              A multi-stage Dockerfile builds the client with Node 22 and serves client and API from a single uvicorn process, as a non-root user with a health
              check. The same app runs as a Vercel Python function and on Heroku (Procfile or heroku.yml).
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-ink">Known limitations</h4>
            <p className="mt-1">
              Buffers are calibrated in-sample on January; production would use a trailing window. Demand is a flat input. The bias is probably caused by
              curtailment in metered output, which needs validating with the client.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-ink">AI assistance</h4>
            <p className="mt-1">Built with Claude Code from a written specification, as disclosed in the README.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
