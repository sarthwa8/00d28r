# WindSight GB — UK Day-Ahead Wind Forecast & Procurement Intelligence

A full-stack web app for a UK utility's day-ahead power trading desk. It answers two questions for every
purchase decision made in **January 2026**:

1. **What was the latest national wind forecast available when the decision had to be made?** (Procurement desk)
2. **How accurate are those forecasts, quantitatively, and how much extra thermal power should we buy to cover the error?** (Error lab)

All numbers come from real **Elexon BMRS** data: `FUELHH` (actual generation, `fuelType = WIND`) and `WINDFOR` (wind forecasts with `publishTime`).
No other data sources are used.

**Live app (Vercel):** https://windsight-00d28r.vercel.app  ·  **API health:** https://windsight-00d28r.vercel.app/api/v1/health  ·  **Repo:** https://github.com/sarthwa8/00d28r

> **AI tool disclosure:** this project was built with the help of AI tools, specifically **Claude Code (Anthropic Claude Opus)**,
> working from a written build specification (`CLAUDE_BUILD_SPEC.md`). The AI generated most of the code, tests and documentation,
> ran the data ingestion, tests, builds and Docker verification. All analytical results shown in the app are computed from the real Elexon data.

---

## Key findings (decisions made 1–31 Jan 2026 → delivery 2 Jan – 1 Feb, D-1 10:00 UTC cutoff)

| Metric | Value |
|---|---|
| Settlement periods evaluated | 1,488 (31 delivery days × 48) |
| MAE / RMSE | **1,996 MW** / 2,499 MW (NMAE 11.2% of peak) |
| Mean bias (forecast − actual) | **+1,727 MW**. The forecast was too high in **85%** of periods |
| MAPE (100 MW floor) | 21.5% |
| P90 / P95 shortfall buffer | **4,187 MW** / 5,334 MW |
| MAE by lead time | 1,656 MW (0–4h) → 2,233 MW (36–48h), +35% |
| Worst single shortfall | 6,857 MW at 12 Jan 01:00 UTC |
| Worst hour of day | 03:00 UTC (MAE 2,364 MW); best 22:00 UTC (1,780 MW) |

Hedging posture trade-off (25 GW flat demand, whole window):

| Posture | Thermal bought D-1 | Left short (imbalance) | Over-bought (long) | Net vs hindsight |
|---|---|---|---|---|
| Raw forecast | 8,920 GWh | 1,385 GWh | 100 GWh | −1,285 GWh |
| **Bias-corrected (median)** | 10,150 GWh | 551 GWh | 495 GWh | **−55 GWh** |
| P90 buffer | 12,008 GWh | 88 GWh | 1,891 GWh | +1,803 GWh |
| P95 buffer | 12,665 GWh | 35 GWh | 2,495 GWh | +2,460 GWh |

Takeaways: trading the raw forecast leaves the desk structurally short. Removing the lead-time-specific median error almost
exactly balances the book. P90/P95 buy insurance against tail shortfalls at the cost of a long position. Moving the cutoff later
(10:00 → 16:00 UTC on D-1) cuts MAE from 1,996 to 1,857 MW.

A plausible cause of the positive bias is that FUELHH is metered **post-curtailment** output while the forecast reflects weather-driven
potential. This is a hypothesis to validate with the client, not a conclusion of this analysis.

---

## Features

The app has two *Trade* workspaces for daily use and two *Present* workspaces that follow the two halves of the video.

**Procurement desk (Trade)**
- Delivery window presets (Jan-2026 decisions, calendar January, weeks 1–4, any single day 1 Jan – 1 Feb).
- Decision rule: **D-1 auction cutoff** (latest forecast with `publishTime ≤ (D−1) + cutoff hour`) or **rolling lead time** (`t−48h ≤ publishTime ≤ t − H`).
- Portfolio demand (MW) and hedging posture: Raw / De-bias (median) / P90 / P95.
- Forecast vs actual chart with an empirical, lead-time-conditional **P10–P90 uncertainty band** and the relied-upon wind line.
- Residual thermal gap chart, daily volume chart, **48-settlement-period schedule** (forecast, publish time, lead time, relied wind,
  actual, error, thermal buy) with **CSV export**.
- Click any chart point or table row to open the **forecast revision history** for that half-hour.

**Error lab (Trade)**
- KPI cards: MAE, RMSE, bias, MAPE, P90/P95 shortfall buffers, worst shortfall, average lead time.
- Error vs lead-time curve (7 buckets, 0–48h), diurnal error profile, signed-error histogram with P5–P95 quantile table, skew and kurtosis.
- Forecast evolution inspector (any settlement period, jump to worst shortfall).
- Risk-buffer calibration table (q10/q50/q90/q95 per lead-time bucket).

**Client briefing (Present)**: the January story for the trading desk. A full-width chart of the forecast against actual wind with
every over-forecast shaded, headline figures, the short-vs-long trade-off for each hedging posture, where the risk concentrates, and
recommendations. Every number is computed live from the API.

**Tech review (Present)**: for the technical lead. A clickable six-step data pipeline (file paths and real row counts), an interactive
no-look-ahead timeline (drag the D-1 cutoff and watch which forecast run the engine selects), a live API explorer with status, latency
and payload size, metric definitions, and test-suite evidence.

---

## Repository layout

```text
.
├── README.md                       # This file
├── DEPLOYMENT_AND_SUBMISSION.md    # Deployment steps, submission checklist, 10-minute video script
├── CLAUDE_BUILD_SPEC.md            # Build specification given to the AI coding agent
├── Dockerfile                      # Multi-stage: Node builds SPA → Python runtime serves API + SPA
├── docker-compose.yml              # `docker compose up --build` → http://localhost:8000
├── vercel.json, .vercelignore      # Vercel: static SPA + Python function at /api/*
├── Procfile, runtime.txt, heroku.yml  # Heroku (buildpack or container stack)
├── requirements.txt, pytest.ini    # Python deps and test config
├── api/index.py                    # Vercel Python function entrypoint (re-exports FastAPI app)
├── backend/
│   ├── config.py                   # Elexon URLs, data window, defaults, lead-time buckets
│   ├── bmrs_client.py              # Chunked Elexon client with retries/backoff + normalisation
│   ├── data_store.py               # gzip JSON snapshot ↔ pandas frames; hourly→30-min interpolation; live refresh
│   ├── analytics.py                # As-of selection, error metrics, quantiles, procurement maths, dashboard builder
│   ├── schemas.py                  # Pydantic v2 response models (the API contract)
│   ├── main.py                     # FastAPI app: /api/v1 routes + SPA static serving
│   ├── scripts/fetch_bmrs_data.py  # CLI: fetch + validate + write the snapshot
│   ├── data/jan2026_bmrs_cache.json.gz  # Real Elexon snapshot (1,632 actuals, 15,679 forecasts, 280 runs)
│   └── tests/                      # pytest: analytics, API, data integrity
└── frontend/
    ├── package.json, vite.config.ts, tsconfig.json, tailwind.config.js, postcss.config.js, index.html
    └── src/
        ├── App.tsx, main.tsx, index.css
        ├── types/api.ts            # TS mirror of backend schemas
        ├── services/apiClient.ts   # Typed fetch client
        ├── lib/format.ts           # Number/time formatting, colour palette
        ├── components/             # Header, ControlBar, KpiStrip, ProcurementDeskTab, AccuracyLabTab,
        │                           # ClientBriefingTab, TechReviewTab, ForecastEvolution(+Modal), ui/ChartTooltip
        └── __tests__/              # Vitest + Testing Library
```

---

## Running the app

**Docker (one command):**
```bash
docker compose up --build
# open http://localhost:8000
```

**Native:**
```bash
cd frontend && npm ci && npm run build && cd ..
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
# open http://localhost:8000
```

**Frontend dev mode with hot reload** (proxies `/api` to port 8000): `cd frontend && npm run dev`, then open http://localhost:5173.

**Refresh the data from Elexon** (public API, no key needed):
```bash
.venv/bin/python -m backend.scripts.fetch_bmrs_data   # rewrites backend/data/jan2026_bmrs_cache.json.gz
# or, at runtime: curl -X POST http://localhost:8000/api/v1/system/refresh
```

**Tests:**
```bash
.venv/bin/pytest                     # 38 backend tests
cd frontend && npx vitest --run      # 7 frontend tests
```

---

## API (`/api/v1`, interactive docs at `/docs`)

| Endpoint | Purpose |
|---|---|
| `GET /health` | Dataset status, counts, ranges, snapshot timestamp |
| `GET /dashboard` | `start_date`, `end_date` (2026-01-01..2026-02-01), `selection_mode` (`day_ahead_cutoff`/`horizon_hours`), `cutoff_hour_utc`, `min_horizon_hours`, `resolution` (`half_hourly`/`hourly_native`), `demand_mw`, `risk_posture` (`raw`/`bias`/`p90`/`p95`) → meta, KPIs, time series, horizon curve, diurnal profile, histogram, daily summary, calibration |
| `GET /forecast-evolution?target_time=…` | Every forecast revision for one settlement period within 48h, plus which one was available at the D-1 cutoff |
| `POST /system/refresh` | Re-fetch from Elexon and recompute |

Invalid dates return HTTP 400 with a clear message; invalid enum values return 422.

---

## Methodology

- **Times**: all UTC. In January, UK local time is GMT, so settlement period = half-hour index of the UTC day + 1.
- **Actuals**: FUELHH filtered to `WIND`, deduplicated per `startTime` (latest `publishTime` wins).
- **Forecasts**: WINDFOR kept for horizons 0–72h, deduplicated per (`publishTime`, `startTime`). WINDFOR is hourly, so the
  `half_hourly` resolution linearly interpolates `:30` points *within each publish run* (never across runs, never extrapolated).
  `hourly_native` compares only the native `:00` points.
- **As-of selection** (no look-ahead): for each target period, keep forecasts published at or before the decision cutoff
  and pick the latest. This is property-tested on the real data.
- **Error** `e = forecast − actual` (positive = over-forecast = wind shortfall).
  MAE, RMSE, MBE, MAPE (`|e| / max(actual, 100 MW)`), NMAE (% of peak actual), quantiles P5…P95.
  Shortfall buffers `B90 = max(0, P90(e))` and `B95 = max(0, P95(e))`.
- **Lead-time calibration**: signed-error quantiles q10/q50/q90/q95 over *all* forecast–actual pairs (0–48h) in the January delivery
  window, per bucket (0–4, 4–8, 8–12, 12–18, 18–24, 24–36, 36–48h). The P10–P90 band for actual wind is `[ŷ − q90, ŷ − q10]`.
- **Procurement**: relied-upon wind `= max(0, ŷ − max(0, q_posture))`; thermal buy `= max(0, demand − relied wind)`; energy `= MW × 0.5h`.
  Short exposure `= max(0, needed − bought)`; long `= max(0, bought − needed)`, where needed `= max(0, demand − actual)`.

**Limitations.** Buffers are calibrated in-sample on January 2026 (a production system would use a trailing window). Demand is a
flat user-supplied MW figure, since the assignment restricts data to wind. The rolling-horizon mode looks back at most 48h, so lead times
near 48h have sparse coverage.

---

## Engineering notes

- **Snapshot + live-refresh architecture**: the real January dataset is fetched once into a deterministic gzip snapshot (~139 KB).
  The app never depends on Elexon being up during a demo, and every environment shows identical numbers.
  A full-month `/dashboard` call takes about 60–90 ms (gzip-compressed responses).
- **One codebase, three runtimes**: FastAPI serves the built SPA in Docker/Heroku. On Vercel the SPA is served from the CDN and
  `api/index.py` exposes the same ASGI app as a Python function.
- **Contract**: Pydantic response models on the backend, mirrored by TypeScript types on the frontend.
- **Verification performed**: pytest 38/38, Vitest 7/7, `tsc` + Vite production build clean, curl smoke tests against uvicorn and the
  Docker container (SPA `200`, API `200`, container health check `healthy`, test suite also passing inside the container).
