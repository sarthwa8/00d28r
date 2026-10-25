# CLAUDE_BUILD_SPEC.md — Fully Autonomous Build Specification
## Project: UK Wind Power Day-Ahead Trading & Forecast Error Intelligence Portal

---

## A. AGENT EXECUTION DIRECTIVE

**READ THIS FIRST — MANDATORY OPERATING INSTRUCTIONS FOR CLAUDE CODE:**

You are executing an end-to-end engineering build for the **UK Wind Power Day-Ahead Trading & Forecast Error Intelligence Portal** (the REint Full Stack SWE Challenge). Your objective is to **build, verify, test, containerize, and prepare for deployment the complete production-grade software product**, not merely explain how it could be built.

1. **Inspect First**: Immediately inspect the current working directory (`ls -la`, `git status`) before creating or modifying files.
2. **Single Source of Truth**: Treat this specification (`CLAUDE_BUILD_SPEC.md`) and the challenge requirements embedded herein as the authoritative source of truth. Do not ask the user routine architectural, domain, UI, or implementation questions. Every decision has already been made in this document.
3. **Autonomous Execution**: Work continuously through Milestones 1 to 7 in order. Create and modify files directly, execute terminal commands, ingest live data from the Elexon BMRS API, run tests, inspect outputs, diagnose any failures, and self-correct until every test and verification check passes.
4. **Zero Placeholders**: Never leave `TODO` comments, mock-only endpoints, stubbed charts, or fake numbers. Fetch real January 2026 UK wind generation actuals (`FUELHH`) and forecasts (`WINDFOR`) from Elexon BMRS, persist them locally into a deterministic snapshot, and power all analytics with real domain math.
5. **Maintain Live Progress Checklist**: Keep an updated status checklist in your working memory (and update the final checklist in `README.md` / verification output) as each milestone completes.
6. **Evidence-Based Completion**: Never claim a feature, test, build, or deployment step is complete without terminal output proving it (e.g., `pytest` passing, `curl` responses verified, `npm run build` succeeding with 0 errors, Docker build/run verified).
7. **Handling External Blockers (Auth/Deployment/Video)**:
   - Elexon BMRS APIs (`https://data.elexon.co.uk/bmrs/api/v1`) are **100% public and require no API key**. You can and must run the real data ingestion immediately.
   - For deployment (Vercel / Heroku) and GitHub repo creation: if the local environment has `vercel`, `heroku`, or `gh` CLI authenticated, perform the deployment and verification automatically. If CLI authentication is missing or requires human browser login, complete 100% of the code, data bundling, Docker verification, and deployment configuration files (`vercel.json`, `Procfile`, `Dockerfile`, `docker-compose.yml`), document the exact 1-command deployment trigger in `DEPLOYMENT_AND_SUBMISSION.md`, and do not fabricate live URLs.

---

## B. FINAL PRODUCT DEFINITION

### 1. Problem Context & User Persona
- **Client**: A UK Energy Utility purchasing wholesale electricity to serve retail/industrial consumers.
- **Target User Persona**: **Day-Ahead Power Trading Desk Analysts & Portfolio Managers** operating in the Great Britain (GB) wholesale electricity market (EPEX SPOT / Nord Pool GB Day-Ahead auctions and OTC bilateral day-ahead procurement).
- **Core Operational Problem**:
  - Consumer electricity demand must be met every 30-minute Settlement Period (SP 1 to SP 48) on Delivery Day $D$.
  - Wind power is a zero-marginal-cost renewable resource, so utility traders only need to procure **residual thermal/dispatchable power** beyond what wind will generate:
    $$\text{Residual Thermal Procurement}_{t} = \text{Expected Consumer Demand}_{t} - \text{Risk-Adjusted Wind Forecast}_{t}$$
  - Because Day-Ahead purchase decisions for Delivery Day $D$ must be submitted on **Decision Day $D-1$** (typically before the GB Day-Ahead auction gate closure at **09:20–11:00 UTC on $D-1$**, or up to 23:59 UTC on $D-1$ for late bilateral trades), traders must rely on wind generation forecasts published before their decision cutoff.
  - However, weather forecasts have error. If wind is **over-forecasted** ($\text{Forecast} > \text{Actual}$), the utility buys too little power day-ahead and is forced into the costly Balancing Mechanism (System Buy Price / Imbalance exposure) or emergency thermal dispatch. If wind is **under-forecasted** ($\text{Forecast} < \text{Actual}$), the utility over-procures thermal power day-ahead.
  - Therefore, traders need a unified portal that:
    1. **Clearly shows the latest renewable (wind) generation forecast available at the moment a purchase decision is made** in January 2026, alongside a horizon selector and residual thermal procurement calculator.
    2. **Quantitatively evaluates historical wind forecast accuracy** across error distributions, lead times (forecast horizons), diurnal settlement periods, and error percentiles ($P_{10}, P_{50}, P_{90}, P_{95}$), enabling traders to apply a **quantified risk buffer (hedging margin in MW)** to their day-ahead purchase decisions.

### 2. Strict Scope Boundaries (From Assignment)
- **Data Sources**: Exclusively Elexon BMRS national-level wind generation datasets:
  - Actuals: `https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream` (filtered to `fuelType == "WIND"`).
  - Forecasts: `https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream`.
  - No external weather APIs or non-Elexon datasets.
- **Temporal Scope**: Purchase decisions made in **January 2026**:
  - **Decision Dates ($D_{\text{decision}}$)**: `2026-01-01` through `2026-01-31` (UTC).
  - **Corresponding Delivery Dates ($D_{\text{delivery}} = D_{\text{decision}} + 1\text{ day}$)**: `2026-01-01` through `2026-02-01` (UTC), plus forecast publications originating from `2025-12-30` onward so that decisions made on `2026-01-01` (and horizons up to 48 hours prior) have complete forecast coverage.
- **Tech Stack Mandate**:
  - Frontend: **React** (TypeScript + Vite + Tailwind CSS + Recharts + Lucide Icons).
  - Backend: **Python** (FastAPI + Pandas + NumPy + Pydantic + HTTPX).
  - Containerization: **Docker** (`Dockerfile` + `docker-compose.yml`).
  - Cloud Deployment: **Vercel** (unified zero-config Python `/api` + React SPA build via `vercel.json`) AND **Heroku** (`Procfile` + single-container multi-stage `Dockerfile` where FastAPI serves the compiled React SPA).

### 3. Mandatory Feature Set & User Workflows
The web application (`WindSight GB — Day-Ahead Trading & Forecast Intelligence`) is organized into **three cohesive operational workspaces** accessible via a top institutional navigation bar:

1. **Tab 1: Day-Ahead Procurement Desk (Decision Simulator & Forecast Explorer)**
   - **Decision Context Controls**:
     - **Target Delivery Date Range / Single Delivery Day Selector** (`2026-01-01` to `2026-02-01`, defaulting to a high-volatility January 2026 showcase window or specific delivery day, with quick presets: *Full Jan 2026*, *Week 1–4*, or *Single Day Trading View*).
     - **Decision Cutoff Time / Minimum Forecast Horizon Control**:
       - Mode A (*Standard Day-Ahead Gate Closure*): Select Decision Day $D-1$ Cutoff Hour (e.g., `10:00 UTC` on $D-1$ for the 11:00 Day-Ahead Auction, meaning only forecasts with $\text{publishTime} \le \text{Cutoff}$ are visible).
       - Mode B (*Rolling Lead-Time Horizon Slider*): Filter dynamically by Forecast Horizon $h \in [0, 48]\text{ hours}$ where $\text{publishTime} \le \text{startTime} - h\text{ hours}$.
     - **Confidence Risk Buffer Selector**: Choose hedging posture:
       - *Unadjusted Latest Forecast ($P_{50}$ / Raw)*
       - *Conservative Downside Buffer ($P_{90}$ Shortfall Protection)*
       - *Extreme Stress Buffer ($P_{95}$ Shortfall Protection)*
     - **Simulated Utility Portfolio Demand Input**: Configurable baseline demand (MW, e.g., default `25,000 MW` national benchmark or custom utility load profile) to calculate **Required Additional Thermal Procurement (MW & MWh)** in real time.
   - **Visualizations & Outputs**:
     - **Primary Time-Series Chart**: High-resolution interactive chart plotting Actual Wind Generation (`FUELHH`, 30-min resolution), Latest Eligible Forecasted Wind Generation (`WINDFOR`), Quantified Uncertainty Band ($P_{10}\text{–}P_{90}$ empirical error envelope around the forecast), and Residual Thermal Gap.
     - **48 Settlement Period Procurement Schedule Table**: Half-hourly table for the selected delivery window showing `startTime`, `Settlement Period (SP1–SP48)`, `Latest Forecast (MW)`, `Forecast Publish Timestamp`, `Lead Time (hrs)`, `P90 Risk-Adjusted Wind (MW)`, `Actual Wind (MW)`, `Forecast Error (MW)`, and `Recommended Additional Thermal Buy (MW)`, with CSV export.

2. **Tab 2: Forecast Accuracy & Quantitative Error Lab**
   - **Comprehensive Error KPI Cards** (computed dynamically over the selected date range & horizon):
     - **MAE** (Mean Absolute Error, MW)
     - **RMSE** (Root Mean Squared Error, MW)
     - **MBE / Bias** (Mean Bias Error, MW — positive = over-forecast / shortfall risk; negative = under-forecast)
     - **MAPE** (Mean Absolute Percentage Error, %)
     - **P90 & P95 Shortfall Risk (MW)** (Empirical 90th/95th percentile of positive forecast error $\max(0, \text{Forecast} - \text{Actual})$, which directly answers *"How many extra MW of thermal backup must we buy so wind under-delivery does not exceed our buffer 90%/95% of the time?"*)
   - **4 Deep-Dive Analytical Charts**:
     1. **Error vs. Forecast Lead-Time Horizon Curve ($1\text{h}$ to $48\text{h}$)**: Plots MAE, RMSE, and Bias across lead-time buckets (`0–4h`, `4–8h`, `8–12h`, `12–18h`, `18–24h`, `24–36h`, `36–48h`), proving how forecast accuracy degrades as horizon increases.
     2. **Diurnal / Time-of-Day Error Profile (00:00 to 23:30 UTC)**: Plots average MAE, Bias, and $P_{10}/P_{90}$ error spread by hour of the day to expose ramp-period vulnerabilities during morning/evening demand peaks.
     3. **Forecast Error Distribution Histogram & Quantile Table**: Empirical distribution of signed errors ($e_t = \hat{y}_t - y_t$) highlighting skewness, kurtosis, tail risk, and exact $P_5, P_{10}, P_{25}, P_{50}, P_{75}, P_{90}, P_{95}$ MW quantiles.
     4. **Forecast Evolution ("Spaghetti / Fan") Inspector**: Select any specific target timestamp in January 2026 and inspect how successive NGESO forecast revisions evolved over the 48 hours leading up to delivery compared to the final actual generation.

3. **Tab 3: Executive Briefing & Methodology (Client Pitch + Tech Lead Review Companion)**
   - Built-in interactive executive summary translating the quantitative findings from January 2026 into concrete operational recommendations for the UK utility client, plus an interactive architecture & data-lineage inspector designed specifically to make the 10-minute video demo (Part 1 Client Pitch + Part 2 Tech Lead Review) effortless and compelling.

---

## C. TECHNICAL ARCHITECTURE

### 1. Architectural Pattern & Dual-Target Deployment Strategy
To guarantee **instant <50ms query performance**, **100% reliability even if Elexon's API rate-limits or hiccups during grading**, and **zero-friction deployment on both Vercel, Heroku, and Docker**, we use a **Pre-Warming + Live-Fallback Analytical Engine Architecture**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   EXTERNAL DATA SOURCE: ELEXON BMRS API                     │
│  • GET https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream         │
│  • GET https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                    (1) Build/Startup Ingestion & Sync Script
                        + Live On-Demand Refresh Endpoint
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                PYTHON BACKEND (FastAPI + Pandas/NumPy Engine)               │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Deterministic Local Data Store (`backend/data/jan2026_bmrs.json.gz`)  │  │
│  │  • Actuals (`FUELHH`, WIND, 30-min resolution, Jan 1 – Feb 1 2026)    │  │
│  │  • Forecasts (`WINDFOR`, all publishTimes Dec 30 2025 – Jan 31 2026)  │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      ▼                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Domain Alignment & Quantitative Analytics Service (`analytics.py`)    │  │
│  │  • Resolution Harmonization (30-min FUELHH <-> WINDFOR interpolation) │  │
│  │  • Horizon Filter (0 <= startTime - publishTime <= 48h)               │  │
│  │  • Point-in-Time As-Of Join (`publishTime <= cutoff` max selector)    │  │
│  │  • Error Metrics (MAE, RMSE, MBE, MAPE, P10/P50/P90/P95 Quantiles)    │  │
│  │  • Procurement Recommendation & Thermal Residual Calculator           │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                      │
│  REST JSON API (`/api/v1/...`)       │  Static SPA Serving (`/` fallback)   │
└──────────────────┬───────────────────┴──────────────────┬───────────────────┘
                   │                                      │
                   ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 REACT FRONTEND (TypeScript + Vite + Tailwind)               │
│  • Tab 1: Day-Ahead Procurement Desk (Interactive Charts, Cutoff/Horizon)   │
│  • Tab 2: Forecast Accuracy & Error Lab (Horizon Curve, Diurnal, Histogram) │
│  • Tab 3: Executive Findings & System Architecture (Demo Companion)         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Why This Architecture Eliminates Every Common Failure Mode
1. **Elexon Stream Payload Size**: Fetching a full month of `FUELHH` (all 16+ fuel types every 30 minutes) and `WINDFOR` (8 forecast runs/day $\times$ multi-day horizon) directly from the browser on every slider drag would take 8–15 seconds per interaction and trigger HTTP 429 rate limits.
2. **Pre-Bundled Verified Snapshot + Live Refresh**: During Milestone 2, Claude Code executes `python -m backend.scripts.fetch_bmrs_data` which fetches the exact January 2026 dataset directly from Elexon's production API, filters `FUELHH` to `fuelType == "WIND"`, filters `WINDFOR` to forecast horizons $0\text{h} \le \text{startTime} - \text{publishTime} \le 72\text{h}$, validates data integrity, and saves a compressed snapshot (`backend/data/jan2026_bmrs_cache.json.gz`, ~150 KB).
3. **In-Memory Vectorized Pandas/NumPy Engine**: At FastAPI startup, the backend loads the snapshot into memory (or fetches live from Elexon if the snapshot is absent or `/api/v1/system/refresh` is called). Slider adjustments in the React UI hit the backend `/api/v1/dashboard` endpoint and return fully computed series, KPIs, horizon curves, histograms, and procurement tables in **< 25 milliseconds**.

---

## D. REPOSITORY BLUEPRINT

Claude Code must create the following exact repository structure:

```text
.
├── CLAUDE_BUILD_SPEC.md                # This specification document
├── README.md                           # Comprehensive project documentation & setup guide
├── DEPLOYMENT_AND_SUBMISSION.md        # Exact deployment & 10-min video script/guide
├── Dockerfile                          # Multi-stage Docker build (Node build + Python FastAPI runtime)
├── docker-compose.yml                  # One-command local orchestration (`docker compose up --build`)
├── .dockerignore                       # Excludes node_modules, .venv, .git from Docker build context
├── .gitignore                          # Standard Python + Node + env ignore rules
├── vercel.json                         # Vercel full-stack config (routes /api/* to Python, /* to Vite dist)
├── Procfile                            # Heroku process definition (`web: uvicorn backend.main:app ...`)
├── runtime.txt                         # Python version for Heroku (`python-3.11.9`)
├── requirements.txt                    # Root Python dependencies (used by Vercel, Heroku, and Docker)
├── pytest.ini                          # Pytest configuration
├── api/
│   └── index.py                        # Vercel Serverless Function entrypoint re-exporting FastAPI `app`
├── backend/
│   ├── __init__.py
│   ├── main.py                         # FastAPI application, CORS, API router, and SPA static file mount
│   ├── config.py                       # Constants, Elexon URLs, date bounds, default parameters
│   ├── schemas.py                      # Strict Pydantic v2 response and request models
│   ├── bmrs_client.py                  # Elexon BMRS HTTP client with chunking, retries, and filtering
│   ├── data_store.py                   # Thread-safe in-memory data manager with gzip JSON persistence
│   ├── analytics.py                    # Core domain math: as-of joins, resolution alignment, error metrics
│   ├── scripts/
│   │   ├── __init__.py
│   │   └── fetch_bmrs_data.py          # CLI script to fetch, verify, and cache Jan 2026 BMRS data
│   ├── data/
│   │   └── jan2026_bmrs_cache.json.gz  # Real Elexon Jan 2026 dataset fetched & verified during build
│   └── tests/
│       ├── __init__.py
│       ├── test_analytics.py           # Unit tests for as-of matching, horizon filtering, MAE/RMSE/quantiles
│       ├── test_api.py                 # FastAPI TestClient integration tests for all endpoints
│       └── test_data_integrity.py      # Verification tests on the real January 2026 Elexon dataset
└── frontend/
    ├── package.json                    # React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide, Vitest
    ├── tsconfig.json                   # TypeScript configuration
    ├── vite.config.ts                  # Vite config with /api proxy to localhost:8000 and Vitest setup
    ├── tailwind.config.js              # Tailwind CSS theme configuration
    ├── postcss.config.js               # PostCSS configuration
    ├── index.html                      # HTML shell with title and Inter / JetBrains Mono fonts
    └── src/
        ├── main.tsx                    # React DOM entry point
        ├── App.tsx                     # Root application layout, state management, and tab router
        ├── index.css                   # Tailwind directives and custom scrollbar/chart styles
        ├── types/
        │   └── api.ts                  # TypeScript interfaces matching backend Pydantic schemas
        ├── services/
        │   └── apiClient.ts            # Typed fetch wrapper for `/api/v1/*` endpoints
        ├── components/
        │   ├── Header.tsx              # Institutional header, system status badge, tab bar
        │   ├── ControlBar.tsx          # Date range, Decision Mode (Cutoff vs Horizon), Demand & Risk Buffer controls
        │   ├── KpiStrip.tsx            # Top-level executive metric cards with tooltips & formulas
        │   ├── ProcurementDeskTab.tsx  # Tab 1: Main Forecast vs Actuals + Residual Thermal Chart & SP Table
        │   ├── AccuracyLabTab.tsx      # Tab 2: Horizon Curve, Diurnal Error, Error Histogram, Forecast Evolution
        │   ├── ExecutivePitchTab.tsx   # Tab 3: Client Pitch Insights + Tech Lead Architecture & Formula Reference
        │   └── ForecastEvolutionModal.tsx # Interactive point-in-time revision history inspector
        └── __tests__/
            └── App.test.tsx            # Frontend component & rendering smoke tests
```

---

## E. DATA, INTEGRATIONS, AND DOMAIN LOGIC

### 1. Verified Elexon BMRS API Specifications
All endpoints below have been verified against official Elexon Insights Solution documentation (`https://bmrs.elexon.co.uk/api-documentation`).
- **Base URL**: `https://data.elexon.co.uk/bmrs/api/v1`
- **Authentication**: None required (Public Open Data API).

#### Endpoint 1: Half-Hourly Generation Outturn by Fuel Type (`FUELHH` Stream)
- **URL**: `GET https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream`
- **Verified Query Parameters**:
  - `settlementDateFrom` (`string`, format `YYYY-MM-DD`): e.g., `2025-12-31`
  - `settlementDateTo` (`string`, format `YYYY-MM-DD`): e.g., `2026-02-02`
  - `fuelType` (`string` or `list[string]`): Pass `fuelType=WIND` (and additionally filter in Python `record.get("fuelType") == "WIND"` for defense-in-depth).
  - *Constraint from Elexon Docs*: `settlementDateFrom`/`settlementDateTo` cannot be combined with `publishDateTimeFrom`/`publishDateTimeTo` in the same request. Always use `settlementDateFrom` and `settlementDateTo` for `FUELHH/stream` (or chunk by 7-day windows).
- **Verified JSON Response Format** (HTTP 200 returns a top-level JSON Array `[...]`):
  ```json
  [
    {
      "dataset": "FUELHH",
      "publishTime": "2026-01-01T00:30:00Z",
      "startTime": "2026-01-01T00:00:00Z",
      "settlementDate": "2026-01-01",
      "settlementPeriod": 1,
      "fuelType": "WIND",
      "generation": 11420
    }
  ]
  ```
- **Resolution**: 30 minutes (`00:00`, `00:30`, `01:00`, ..., `23:30` UTC). Units: **MW** (average power over the 30-minute settlement period).

#### Endpoint 2: Wind Generation Forecast (`WINDFOR` Stream)
- **URL**: `GET https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream`
- **Verified Query Parameters**:
  - `publishDateTimeFrom` (`string`, ISO-8601 UTC): e.g., `2025-12-29T00:00:00Z`
  - `publishDateTimeTo` (`string`, ISO-8601 UTC): e.g., `2026-02-01T23:59:59Z`
  - *Chunking Rule*: Fetch in 7-day `publishDateTimeFrom` / `publishDateTimeTo` chunks across `[2025-12-29T00:00:00Z, 2026-02-01T23:59:59Z]` to prevent large stream timeouts.
- **Verified JSON Response Format** (HTTP 200 returns a top-level JSON Array `[...]`):
  ```json
  [
    {
      "dataset": "WINDFOR",
      "publishTime": "2026-01-01T08:30:00Z",
      "startTime": "2026-01-02T00:00:00Z",
      "generation": 12850
    }
  ]
  ```
- **Publication Cadence & Horizon Characteristics**:
  - Published by NESO / NGESO up to 8 times per day (typically around `03:30`, `05:30`, `08:30`, `10:30`, `12:30`, `16:30`, `19:30`, and `23:30` UTC).
  - Each publication projects wind generation forward across multiple days. We retain records where forecast horizon $h$:
    $$h = \frac{\text{startTime} - \text{publishTime}}{3600\text{ seconds}} \in [0.0, 72.0]\text{ hours}$$
    (specifically highlighting $[0, 48]\text{ hours}$ for day-ahead and intraday evaluation).

---

### 2. Resolution Harmonization & Timestamp Alignment Rules (CRITICAL)
1. **Timezone Standardization**:
   - All timestamps from Elexon are UTC (`Z`). In January, UK local time is GMT (`UTC+0`), so UTC and UK local settlement time are identical. Parse all timestamps into timezone-aware `UTC` `pd.Timestamp` objects floored to the minute.
2. **Deduplication of Actuals (`FUELHH`)**:
   - Filter strictly to `fuelType == "WIND"` and `generation.notna()`.
   - If multiple records share the same `startTime`, sort by `publishTime` ascending and keep the latest (`last`).
3. **Deduplication & Half-Hourly Harmonization of Forecasts (`WINDFOR`)**:
   - Raw `WINDFOR` records are typically published at **1-hour resolution** (`startTime` at `:00` minutes), whereas `FUELHH` actuals are at **30-minute resolution** (`:00` and `:30` minutes).
   - **Harmonization Rule**:
     - First, for each unique `(publishTime, startTime)` pair in raw `WINDFOR`, deduplicate by keeping the last record.
     - Second, to enable both exact native point comparison and complete 48-Settlement-Period half-hourly day-ahead scheduling:
       - Within each forecast batch (`publishTime`), if `WINDFOR` only contains `:00` hourly timestamps, generate the intermediate `:30` half-hourly settlement periods by **linear time interpolation between consecutive hourly forecast points of the same `publishTime` batch** (marking those rows with `is_interpolated = True`, and native `:00` rows with `is_interpolated = False`).
       - Expose a toggle/parameter `resolution_mode: "half_hourly" | "hourly_native"` (defaulting to `"half_hourly"` so every 30-minute settlement period SP1–SP48 on `FUELHH` is populated, while allowing tech reviewers to verify `"hourly_native"` un-interpolated metrics as well!).

---

### 3. Point-in-Time ("As-Of") Forecast Selection Algorithm
When a utility trader makes a purchase decision for target delivery timestamp $t_{\text{start}}$, which forecast was actually available to them?

We support **two complementary, mathematically rigorous selection modes** (selectable in the UI Control Bar):

#### Mode 1: Day-Ahead Gate Closure Mode (`mode = "day_ahead_cutoff"`)
In the UK wholesale market, day-ahead procurement for Delivery Date $D$ (which covers 48 settlement periods from $D\text{ 00:00 UTC}$ to $D\text{ 23:30 UTC}$) is decided on **Decision Date $D-1$** at a specified **Gate Closure Cutoff Hour $c_{\text{hour}}$** (default `10:00 UTC` on $D-1$, just prior to the 11:00 UTC EPEX/Nord Pool auction; configurable between `06:00 UTC` and `23:30 UTC` on $D-1$).
- For every settlement period $t_{\text{start}}$ belonging to Delivery Date $D$:
  $$\text{Cutoff}(t_{\text{start}}) = \text{Date}(t_{\text{start}}) - 1\text{ day} + c_{\text{hour}}$$
- A forecast record $(t_{\text{pub}}, t_{\text{start}}, \hat{y})$ is **eligible** if and only if:
  $$t_{\text{pub}} \le \text{Cutoff}(t_{\text{start}})$$
- Among all eligible forecasts for $t_{\text{start}}$, select the single forecast with the **maximum (most recent) `publishTime`**:
  $$\hat{y}^*(t_{\text{start}}) = \arg\max_{t_{\text{pub}} \le \text{Cutoff}(t_{\text{start}})} t_{\text{pub}}$$
- Note: Under this mode, a January 2026 **purchase decision** ($D_{\text{decision}} \in [\text{2026-01-01}, \text{2026-01-31}]$) corresponds to **Delivery Dates** $D_{\text{delivery}} \in [\text{2026-01-02}, \text{2026-02-01}]$ (and we also allow viewing Delivery Date `2026-01-01` whose day-ahead decision was made on `2025-12-31`).

#### Mode 2: Rolling Forecast Horizon Mode (`mode = "horizon_hours"`)
For continuous rolling analysis or comparing forecast skill at a minimum lead time $H_{\min} \in [0, 48]\text{ hours}$ (default `24` hours for day-ahead, or user-selected slider e.g. `4h`, `12h`, `24h`, `36h`):
- For each target timestamp $t_{\text{start}}$:
  $$\text{Cutoff}(t_{\text{start}}) = t_{\text{start}} - H_{\min}\text{ hours}$$
- A forecast record is eligible if:
  $$t_{\text{start}} - 48\text{ hours} \le t_{\text{pub}} \le t_{\text{start}} - H_{\min}\text{ hours}$$
- Select the forecast with the **maximum `publishTime`** satisfying that constraint.

---

### 4. Quantitative Error Metrics & Risk-Adjusted Procurement Math
For any aligned pair of selected Forecast $\hat{y}_t$ (MW) and Actual $y_t$ (MW) over $N$ settlement periods ($t = 1, \dots, N$):

1. **Signed Forecast Error ($e_t$) and Shortfall Error ($s_t$)**:
   $$e_t = \hat{y}_t - y_t \quad (\text{MW})$$
   - **Positive Error ($e_t > 0$)**: **Over-forecast / Wind Shortfall Risk**. Forecast promised more wind than actually materialized. Utility faces a generation deficit and must procure emergency power.
   - **Negative Error ($e_t < 0$)**: **Under-forecast / Excess Wind**. Actual wind exceeded forecast.
   - **Shortfall Magnitude ($s_t$)**:
     $$s_t = \max(0, \hat{y}_t - y_t)$$

2. **Aggregate Accuracy Metrics**:
   - **Mean Absolute Error (MAE)**:
     $$\text{MAE} = \frac{1}{N} \sum_{t=1}^{N} |\hat{y}_t - y_t|$$
   - **Root Mean Squared Error (RMSE)**:
     $$\text{RMSE} = \sqrt{\frac{1}{N} \sum_{t=1}^{N} (\hat{y}_t - y_t)^2}$$
   - **Mean Bias Error (MBE)**:
     $$\text{MBE} = \frac{1}{N} \sum_{t=1}^{N} (\hat{y}_t - y_t)$$
   - **Mean Absolute Percentage Error (MAPE)**:
     $$\text{MAPE} = \frac{100\%}{N} \sum_{t=1}^{N} \frac{|\hat{y}_t - y_t|}{\max(y_t, 100\text{ MW})}$$
     *(Floor denominator at 100 MW to prevent division-by-zero distortion during near-zero wind lulls).*
   - **Normalized MAE (% of Peak Actual Wind)**:
     $$\text{NMAE} = \frac{\text{MAE}}{\max_{t}(y_t)} \times 100\%$$

3. **Empirical Error Quantiles & Confidence Bands**:
   - Compute empirical percentiles of signed error $e_t = \hat{y}_t - y_t$: $Q_{05}, Q_{10}, Q_{25}, Q_{50}, Q_{75}, Q_{90}, Q_{95}$.
   - **90% Shortfall Risk Buffer ($B_{90}$)**:
     $$B_{90} = \max\left(0, \text{Percentile}_{90}(e_t)\right)$$
     *Interpretation*: In 90% of half-hourly settlement periods, actual wind generation is at least $\hat{y}_t - B_{90}$.
   - **95% Shortfall Risk Buffer ($B_{95}$)**:
     $$B_{95} = \max\left(0, \text{Percentile}_{95}(e_t)\right)$$
   - **Horizon-Specific Conditional Uncertainty Band**:
     For each lead-time bucket $b \in \{[0,4), [4,8), [8,12), [12,18), [18,24), [24,36), [36,48]\}$ hours, compute empirical $(q_{10}^{(b)}, q_{90}^{(b)}, q_{95}^{(b)})$ of $e_t$.
     Then for any point $\hat{y}_t$ at lead time $h_t \in b$, the **80% Empirical Prediction Interval ($P_{10}\text{–}P_{90}$)** for Actual Wind is:
     $$\text{Lower}_{P10}(t) = \max\left(0, \hat{y}_t - q_{90}^{(b)}\right), \qquad \text{Upper}_{P90}(t) = \hat{y}_t - q_{10}^{(b)}$$

4. **Day-Ahead Thermal Procurement Calculation**:
   Given target portfolio electricity demand $D_t$ (MW, user-configurable, default `25,000 MW`) and selected risk posture $\alpha \in \{\text{raw}, P_{90}, P_{95}\}$:
   - **Risk-Adjusted Relied-Upon Wind ($\tilde{y}_t$)**:
     $$\tilde{y}_t = \begin{cases} \hat{y}_t & \text{if posture} = \text{raw} \\ \max(0, \hat{y}_t - q_{90}^{(b)}) & \text{if posture} = P_{90} \\ \max(0, \hat{y}_t - q_{95}^{(b)}) & \text{if posture} = P_{95} \end{cases}$$
   - **Recommended Day-Ahead Thermal Procurement ($P_{\text{thermal}, t}$)**:
     $$P_{\text{thermal}, t} = \max(0, D_t - \tilde{y}_t) \quad (\text{MW})$$
   - **Energy Volume (MWh)** for a 30-minute settlement period:
     $$E_{\text{thermal}, t} = P_{\text{thermal}, t} \times 0.5\text{ hours} \quad (\text{MWh})$$

---

## F. COMPLETE IMPLEMENTATION INSTRUCTIONS (MILESTONE BY MILESTONE)

Execute the following milestones sequentially. Do not skip any verification step.

---

### MILESTONE 1: Project Initialization & Dependency Setup

#### 1. Objective
Initialize the repository structure, Python virtual environment, root `requirements.txt`, and `backend/` package skeleton.

#### 2. Files to Create
- `.gitignore`
- `.dockerignore`
- `requirements.txt`
- `pytest.ini`
- `runtime.txt`
- `backend/__init__.py`
- `backend/config.py`

#### 3. Implementation Requirements
- **`requirements.txt`**:
  ```text
  fastapi>=0.110.0,<1.0.0
  uvicorn[standard]>=0.29.0,<1.0.0
  pydantic>=2.6.0,<3.0.0
  pandas>=2.2.0,<3.0.0
  numpy>=1.26.0,<3.0.0
  httpx>=0.27.0,<1.0.0
  pytest>=8.0.0,<9.0.0
  ```
- **`runtime.txt`**:
  ```text
  python-3.11.9
  ```
- **`backend/config.py`**:
  Define constants:
  - `BMRS_BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"`
  - `FUELHH_STREAM_URL = f"{BMRS_BASE_URL}/datasets/FUELHH/stream"`
  - `WINDFOR_STREAM_URL = f"{BMRS_BASE_URL}/datasets/WINDFOR/stream"`
  - `DATA_CACHE_PATH = Path(__file__).resolve().parent / "data" / "jan2026_bmrs_cache.json.gz"`
  - `ACTUALS_START_DATE = "2025-12-31"`
  - `ACTUALS_END_DATE = "2026-02-02"`
  - `FORECAST_PUBLISH_START = "2025-12-29T00:00:00Z"`
  - `FORECAST_PUBLISH_END = "2026-02-02T00:00:00Z"`
  - `MAX_HORIZON_HOURS = 72.0`
  - `DEFAULT_DEMAND_MW = 25000.0`

#### 4. Commands to Execute
```bash
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

#### 5. Acceptance Criteria
- Virtual environment `.venv` is created and all packages install cleanly with exit code 0.

---

### MILESTONE 2: Elexon BMRS Data Ingestion, Validation & Local Snapshot Generation

#### 1. Objective
Implement the Elexon BMRS API client (`backend/bmrs_client.py`), data persistence store (`backend/data_store.py`), and CLI ingestion script (`backend/scripts/fetch_bmrs_data.py`), then **execute the script against the live Elexon API** to populate and verify `backend/data/jan2026_bmrs_cache.json.gz`.

#### 2. Files to Create
- `backend/bmrs_client.py`
- `backend/data_store.py`
- `backend/scripts/__init__.py`
- `backend/scripts/fetch_bmrs_data.py`
- `backend/data/jan2026_bmrs_cache.json.gz` (generated by running the script)

#### 3. Implementation Requirements
- **`backend/bmrs_client.py`**:
  - Implement `fetch_fuelhh_wind(start_date: str, end_date: str) -> list[dict]`:
    - Break the date range `[start_date, end_date]` into 7-day chunks (`settlementDateFrom`, `settlementDateTo`).
    - Query `GET https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream` with params `{"settlementDateFrom": chunk_start, "settlementDateTo": chunk_end, "fuelType": "WIND"}`.
    - Use `httpx.Client(timeout=45.0)` with up to 3 exponential-backoff retries on network errors or HTTP 429/5xx.
    - Filter returned list items to ensure `item.get("fuelType") == "WIND"` and `item.get("generation") is not None`.
    - Normalize each record to `{"startTime": str, "publishTime": str, "settlementDate": str, "settlementPeriod": int, "generation": float}`.
    - Deduplicate by `startTime` (keeping the record with the latest `publishTime`), and sort ascending by `startTime`.
  - Implement `fetch_windfor(publish_from: str, publish_to: str) -> list[dict]`:
    - Break `[publish_from, publish_to]` into 5-day ISO timestamp chunks (`publishDateTimeFrom`, `publishDateTimeTo`).
    - Query `GET https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream` with params `{"publishDateTimeFrom": chunk_start, "publishDateTimeTo": chunk_end}`.
    - For each record, parse `publishTime` and `startTime` as UTC timestamps and calculate `horizon_hours = (start_dt - publish_dt).total_seconds() / 3600.0`.
    - Filter to records where `0.0 <= horizon_hours <= 72.0` and `"2025-12-31T00:00:00Z" <= startTime <= "2026-02-02T23:30:00Z"`.
    - Deduplicate by `(publishTime, startTime)` and sort by `(publishTime, startTime)`.
- **`backend/scripts/fetch_bmrs_data.py`**:
  - Fetches both datasets for January 2026 decisions (`ACTUALS_START_DATE = "2025-12-31"` to `"2026-02-02"`, `FORECAST_PUBLISH_START = "2025-12-29T00:00:00Z"` to `"2026-02-02T00:00:00Z"`).
  - Verifies non-empty row counts (expecting ~1,500+ actual half-hourly rows and ~10,000+ forecast rows).
  - Writes compressed JSON payload to `backend/data/jan2026_bmrs_cache.json.gz` containing metadata (`fetched_at_utc`, `source_urls`, `actuals_count`, `forecasts_count`) and lists `actuals` and `forecasts`.
- **`backend/data_store.py`**:
  - Loads `jan2026_bmrs_cache.json.gz` into pre-parsed Pandas DataFrames on startup (`actuals_df`, `forecasts_raw_df`, `forecasts_half_hourly_df`), and provides a `.refresh_from_live_api()` method.
  - Pre-computes `forecasts_half_hourly_df`: for each `publishTime` group in `forecasts_raw_df`, reindexes `startTime` onto a 30-minute grid (`30min` frequency between min and max `startTime` of that `publishTime` batch) and linearly interpolates `generation` for `:30` settlement periods, setting boolean flag `is_interpolated`.

#### 4. Commands to Execute
```bash
.venv/bin/python -m backend.scripts.fetch_bmrs_data
ls -lh backend/data/jan2026_bmrs_cache.json.gz
```

#### 5. Acceptance Criteria
- `backend/data/jan2026_bmrs_cache.json.gz` exists, is non-empty, and contains real January 2026 Elexon `FUELHH` (`WIND`) and `WINDFOR` records.
- Print summary statistics from the script confirming coverage from `2026-01-01` through `2026-02-01`.

---

### MILESTONE 3: Domain Analytics Engine, FastAPI Endpoints & Backend Test Suite

#### 1. Objective
Implement the quantitative domain engine (`backend/analytics.py`), Pydantic schemas (`backend/schemas.py`), FastAPI application (`backend/main.py` and `api/index.py`), and comprehensive backend `pytest` suite (`backend/tests/`).

#### 2. Files to Create
- `backend/schemas.py`
- `backend/analytics.py`
- `backend/main.py`
- `api/index.py`
- `backend/tests/__init__.py`
- `backend/tests/test_analytics.py`
- `backend/tests/test_api.py`
- `backend/tests/test_data_integrity.py`

#### 3. Exact Backend API Contract
All API routes must be prefixed with `/api/v1`:

1. **`GET /api/v1/health`**
   - Returns dataset status, record counts, date bounds, and cache timestamp.
2. **`GET /api/v1/dashboard`**
   - **Query Parameters**:
     - `start_date`: `str = "2026-01-01"` (Delivery start date `YYYY-MM-DD`)
     - `end_date`: `str = "2026-01-31"` (Delivery end date `YYYY-MM-DD`, supports up to `"2026-02-01"`)
     - `selection_mode`: `Literal["day_ahead_cutoff", "horizon_hours"] = "day_ahead_cutoff"`
     - `cutoff_hour_utc`: `int = 10` (Used when `selection_mode == "day_ahead_cutoff"`; hour `0..23` on Day $D-1$, default `10` for 10:00 UTC prior to 11:00 Day-Ahead auction)
     - `min_horizon_hours`: `float = 24.0` (Used when `selection_mode == "horizon_hours"`; range `0.0..48.0`)
     - `resolution`: `Literal["half_hourly", "hourly_native"] = "half_hourly"`
     - `demand_mw`: `float = 25000.0` (Target consumer demand in MW for thermal residual calculation)
     - `risk_posture`: `Literal["raw", "p90", "p95"] = "p90"`
   - **Response Payload (`DashboardResponse`)**:
     - `meta`: Request parameters echoed back + matched sample count $N$, total MWh actual, total MWh forecast, total recommended thermal MWh.
     - `kpis`:
       - `mae_mw`, `rmse_mw`, `mbe_mw` (bias), `mape_pct`, `nmae_pct`
       - `p10_error_mw`, `p50_error_mw`, `p90_error_mw`, `p95_error_mw`
       - `p90_shortfall_buffer_mw`, `p95_shortfall_buffer_mw`
       - `max_overforecast_mw` (largest shortfall event + timestamp), `max_underforecast_mw` (largest surplus event + timestamp)
       - `avg_actual_mw`, `peak_actual_mw`, `min_actual_mw`, `avg_forecast_mw`
       - `avg_lead_time_hours`
     - `timeseries`: List of aligned time-series points:
       - `startTime` (`ISO-8601 UTC`)
       - `settlementDate` (`YYYY-MM-DD`)
       - `settlementPeriod` (`1..48`)
       - `actual_mw` (`float | None`)
       - `forecast_mw` (`float | None`)
       - `publishTime` (`str | None`)
       - `horizon_hours` (`float | None`)
       - `is_interpolated` (`bool`)
       - `error_mw` (`float | None`, $\hat{y}_t - y_t$)
       - `abs_error_mw` (`float | None`)
       - `p10_bound_mw` (`float | None`, lower empirical bound for actuals)
       - `p90_bound_mw` (`float | None`, upper empirical bound for actuals)
       - `risk_adjusted_wind_mw` (`float | None`, $\tilde{y}_t$)
       - `thermal_procurement_mw` (`float | None`, $\max(0, D_t - \tilde{y}_t)$)
       - `actual_thermal_needed_mw` (`float | None`, $\max(0, D_t - y_t)$)
     - `horizon_accuracy`: List of lead-time buckets (`0-4h`, `4-8h`, `8-12h`, `12-18h`, `18-24h`, `24-36h`, `36-48h`) computed over all forecast-actual pairs in the selected date window:
       - `bucket_label`, `min_h`, `max_h`, `sample_count`, `mae_mw`, `rmse_mw`, `mbe_mw`, `mape_pct`, `p90_shortfall_mw`, `p95_shortfall_mw`
     - `diurnal_profile`: List of 24 hourly buckets (`00:00` to `23:00` UTC):
       - `hour_utc` (`0..23`), `label` (`"00:00"`..`"23:00"`), `avg_actual_mw`, `avg_forecast_mw`, `mae_mw`, `mbe_mw`, `p10_error_mw`, `p90_error_mw`
     - `error_distribution`: List of 20 histogram bins of signed error $e_t = \hat{y}_t - y_t$:
       - `bin_start_mw`, `bin_end_mw`, `bin_center_mw`, `count`, `percentage`
     - `daily_summary`: List of daily aggregates for each delivery date in the range:
       - `date`, `decision_date`, `actual_mwh`, `forecast_mwh`, `risk_adjusted_wind_mwh`, `recommended_thermal_mwh`, `mae_mw`, `mbe_mw`, `max_shortfall_mw`
3. **`GET /api/v1/forecast-evolution`**
   - **Query Parameter**: `target_time` (`str`, ISO-8601 UTC, e.g. `"2026-01-15T18:00:00Z"`)
   - **Response**: Returns the actual generation at `target_time` and every historical `WINDFOR` forecast published for that `target_time` sorted by `publishTime` ascending, showing `publishTime`, `horizon_hours`, `forecast_mw`, and `error_mw`. This powers the interactive Forecast Evolution Inspector.
4. **`POST /api/v1/system/refresh`**
   - Triggers a live re-fetch from Elexon BMRS API (`FUELHH/stream` and `WINDFOR/stream`), updates the cache, and returns the updated health status.

#### 4. Commands to Execute
```bash
.venv/bin/pytest -v
```

#### 5. Acceptance Criteria
- All unit, API, and data-integrity tests in `backend/tests/` pass (`0 failed`).
- `/api/v1/dashboard` responds in `< 100ms` with complete, mathematically consistent metrics.

---

### MILESTONE 4: Frontend React Application & Interactive Visualizations

#### 1. Objective
Build the React + TypeScript + Tailwind CSS + Recharts frontend application inside `frontend/`, implementing all three operational tabs, interactive controls, charts, tables, CSV export, and Forecast Evolution drill-down.

#### 2. Files to Create
- `frontend/package.json`
- `frontend/tsconfig.json`
- `frontend/vite.config.ts`
- `frontend/tailwind.config.js`
- `frontend/postcss.config.js`
- `frontend/index.html`
- `frontend/src/index.css`
- `frontend/src/main.tsx`
- `frontend/src/types/api.ts`
- `frontend/src/services/apiClient.ts`
- `frontend/src/components/Header.tsx`
- `frontend/src/components/ControlBar.tsx`
- `frontend/src/components/KpiStrip.tsx`
- `frontend/src/components/ProcurementDeskTab.tsx`
- `frontend/src/components/AccuracyLabTab.tsx`
- `frontend/src/components/ExecutivePitchTab.tsx`
- `frontend/src/components/ForecastEvolutionModal.tsx`
- `frontend/src/App.tsx`
- `frontend/src/__tests__/App.test.tsx`

#### 3. Commands to Execute
```bash
cd frontend
npm install
npm run build
npm test -- --run
cd ..
```

#### 4. Acceptance Criteria
- `npm run build` succeeds with zero TypeScript or bundler errors and outputs `frontend/dist/`.
- Vitest frontend component tests pass.

---

### MILESTONE 5: UI/UX Polish, Static Serving Integration & End-to-End Verification

#### 1. Objective
Configure `backend/main.py` to automatically serve the compiled React frontend (`frontend/dist`) at `/` whenever `frontend/dist` exists, while keeping `/api/v1/*` routes priority-mounted. Verify end-to-end functionality against the running server.

#### 2. Implementation Requirements
- In `backend/main.py`:
  - Mount `/api/v1` endpoints first.
  - Check if `frontend/dist` exists. If it does, mount `frontend/dist/assets` at `/assets` and serve `frontend/dist/index.html` for `/` and any non-API SPA paths.
- Start the server locally and run automated curl checks against `/`, `/api/v1/health`, `/api/v1/dashboard`, and `/api/v1/forecast-evolution`.

#### 3. Acceptance Criteria
- Single-process Uvicorn server serves both the React SPA HTML/JS/CSS and all `/api/v1/*` JSON endpoints cleanly.

---

### MILESTONE 6: Dockerization & Cloud Deployment Readiness (Vercel + Heroku)

#### 1. Objective
Create and verify the multi-stage `Dockerfile`, `docker-compose.yml`, `vercel.json`, and `Procfile` so the application runs with a single `docker compose up --build` command and deploys effortlessly to Vercel or Heroku.

#### 2. Files to Create
- `Dockerfile`
- `docker-compose.yml`
- `vercel.json`
- `Procfile`

#### 3. Exact Configuration Specifications
- **`Dockerfile`** (Multi-stage build supporting both local Docker and Heroku Container stack):
  ```dockerfile
  # Stage 1: Build React Frontend
  FROM node:20-alpine AS frontend-builder
  WORKDIR /app/frontend
  COPY frontend/package*.json ./
  RUN npm install
  COPY frontend/ ./
  RUN npm run build

  # Stage 2: Python FastAPI Runtime serving API + Built Frontend
  FROM python:3.11-slim
  WORKDIR /app
  ENV PYTHONDONTWRITEBYTECODE=1
  ENV PYTHONUNBUFFERED=1
  COPY requirements.txt ./
  RUN pip install --no-cache-dir -r requirements.txt
  COPY backend/ ./backend/
  COPY api/ ./api/
  COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
  EXPOSE 8000
  CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
  ```
- **`docker-compose.yml`**:
  ```yaml
  services:
    windsight-portal:
      build:
        context: .
        dockerfile: Dockerfile
      ports:
        - "8000:8000"
      environment:
        - PORT=8000
      restart: unless-stopped
  ```
- **`vercel.json`**:
  ```json
  {
    "buildCommand": "cd frontend && npm install && npm run build",
    "outputDirectory": "frontend/dist",
    "rewrites": [
      {
        "source": "/api/(.*)",
        "destination": "/api/index.py"
      },
      {
        "source": "/((?!api/).*)",
        "destination": "/index.html"
      }
    ]
  }
  ```
- **`Procfile`** (for Heroku):
  ```text
  web: uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
  ```

---

### MILESTONE 7: Documentation, Video Pitch Script & Deliverable Packaging

#### 1. Objective
Write a thorough, transparent `README.md` (explicitly noting AI tool usage as required by the prompt, directory blueprint, startup instructions, mathematical methodology, key analytical findings from January 2026, and deployment links) and `DEPLOYMENT_AND_SUBMISSION.md` (containing the step-by-step 10-minute video demo script split into Part 1 Client Pitch and Part 2 Tech Lead Review, plus exact GitHub/Vercel/Heroku submission steps).

---

## G. UI/UX AND PRODUCT QUALITY SPECIFICATION

### 1. Visual Direction & Institutional Energy Trading Theme
- **Aesthetic Persona**: High-trust UK Energy Trading & Quantitative Grid Intelligence Terminal (inspired by Bloomberg Energy, Kraken Technologies, and National Grid ESO Insights).
- **Color Palette**:
  - Background Canvas: Deep Slate (`#0B0F19` / `bg-slate-950`) with elevated surface cards (`#111827` / `bg-slate-900/90`) and subtle `1px` borders (`border-slate-800`).
  - Primary Accent (Actual Wind Generation): Electric Emerald (`#10B981` / `emerald-500`).
  - Secondary Accent (Forecasted Wind Generation): Sky Cyan (`#38BDF8` / `sky-400`).
  - Risk / Thermal Procurement / Shortfall Buffer Accent: Amber Gold (`#F59E0B` / `amber-500`) and Coral Rose (`#F43F5E` / `rose-500`) for shortfall deficits.
  - Uncertainty Fan ($P_{10}\text{–}P_{90}$ Envelope): Translucent Sky/Indigo fill (`#38BDF8` at `0.15` opacity).
- **Typography**:
  - UI & Headings: `Inter` or system sans-serif, tight tracking, clear hierarchy.
  - Numerical Values, MW/MWh Metrics, Timestamps, and Settlement Periods: `JetBrains Mono` (`font-mono` with `tabular-nums`) so numbers never jitter when sliders move.

### 2. Information Hierarchy & Interactive Controls
- **Sticky Institutional Header**:
  - Product Title: **WindSight GB** | *UK Day-Ahead Wind Forecast & Procurement Intelligence*
  - Live Data Status Badge showing `Elexon BMRS Verified • Jan 2026 Decision Window • 30-Min Settlement Resolution`.
  - Navigation Tabs:
    1. `Day-Ahead Procurement Desk`
    2. `Forecast Accuracy & Error Lab`
    3. `Executive Pitch & Architecture`
- **Global Decision Control Bar** (visible on Tabs 1 & 2):
  - **Quick Date Range Presets**:
    - `Full Month (Jan 2026)`
    - `Week 1 (Jan 1–7)`
    - `Week 2 (Jan 8–14)`
    - `Week 3 (Jan 15–21)`
    - `Week 4 (Jan 22–31)`
    - `Single Delivery Day Inspector` (with date picker `2026-01-01` to `2026-02-01`)
  - **Decision Rule Selector**:
    - `D-1 Auction Cutoff Mode` (with Cutoff Time selector, default `10:00 UTC on D-1` before the 11:00 Day-Ahead Auction)
    - `Rolling Lead-Time Horizon Mode` (with interactive slider `0h` to `48h`, default `24h`)
  - **Portfolio Demand & Risk Posture Controls**:
    - `Consumer Demand (MW)` numeric input/slider (`15,000 MW` – `45,000 MW`, default `25,000 MW`)
    - `Hedging Buffer`: `Raw Forecast (P50)` | `P90 Conservative Buffer` | `P95 Stress Buffer`
- **Click-to-Inspect Point-in-Time Evolution**:
  - Clicking any data point on the main time-series chart (or clicking "Inspect Revisions" on any row in the Settlement Period table) opens the **Forecast Evolution Drawer/Modal**, showing how NGESO's wind forecast for that exact 30-minute period evolved across all publication runs leading up to delivery.

---

## H. TESTING AND VERIFICATION PLAN

Claude Code must execute and verify all of the following test suites before finishing:

### 1. Backend Automated Tests (`pytest`)
- **`backend/tests/test_data_integrity.py`**:
  - Verifies `jan2026_bmrs_cache.json.gz` exists and loads cleanly.
  - Asserts `actuals` contains records spanning `2026-01-01` through `2026-01-31` (and `2026-02-01`), all with `generation >= 0`.
  - Asserts `forecasts` contains records published in January 2026 with horizons between `0` and `72` hours.
- **`backend/tests/test_analytics.py`**:
  - Tests `select_as_of_forecasts` under `"day_ahead_cutoff"` mode: verifies that for any delivery timestamp on Day $D$, the selected forecast always satisfies $\text{publishTime} \le (D - 1\text{ day}) + c_{\text{hour}}$ and chooses the maximum `publishTime` prior to cutoff.
  - Tests `select_as_of_forecasts` under `"horizon_hours"` mode: verifies $\text{publishTime} \le \text{startTime} - H_{\min}$.
  - Tests resolution alignment (`half_hourly` vs `hourly_native`).
  - Tests mathematical accuracy of `MAE`, `RMSE`, `MBE`, `MAPE`, `P90 Shortfall Buffer`, and `Thermal Procurement MW` against known synthetic vectors.
- **`backend/tests/test_api.py`**:
  - Uses `fastapi.testclient.TestClient` to test:
    - `GET /api/v1/health` (HTTP 200)
    - `GET /api/v1/dashboard` with default params, `horizon_hours` mode, single-day filter, and `hourly_native` resolution (HTTP 200, valid schema, non-empty series and horizon buckets)
    - `GET /api/v1/forecast-evolution?target_time=2026-01-15T18:00:00Z` (HTTP 200, ordered revisions)
    - Invalid date parameter handling (HTTP 400 with clean message)

### 2. Frontend Build & Component Tests
- `cd frontend && npm run build`: Zero TypeScript compilation errors or Vite bundle failures.
- `cd frontend && npm test -- --run`: Vitest unit/component test verifying header, tabs, and KPI rendering.

### 3. Live Runtime & Container Smoke Tests
- Start backend + static SPA via Uvicorn and verify via `curl` that:
  - `http://127.0.0.1:8000/` returns the HTML SPA (`200 OK`).
  - `http://127.0.0.1:8000/api/v1/dashboard?start_date=2026-01-01&end_date=2026-01-31` returns valid JSON (`200 OK`).
- If `docker` daemon is available in the environment, run `docker build -t windsight-portal .` and verify container startup.

---

## I. DEVELOPMENT ENVIRONMENT AND DEPLOYMENT

### 1. Local Development Commands
- **One-Command Docker Start**:
  ```bash
  docker compose up --build
  # App available at http://localhost:8000
  ```
- **Local Native Start (Without Docker)**:
  ```bash
  # 1. Install & build frontend
  cd frontend && npm install && npm run build && cd ..
  # 2. Install Python deps & start unified FastAPI server
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
  .venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
  # App available at http://localhost:8000
  ```

### 2. Cloud Deployment Options (Both Configured Out-of-the-Box)
- **Option A: Vercel (Recommended Zero-Config Full-Stack Deployment)**
  - `vercel.json` and `api/index.py` are pre-configured so running `npx vercel --prod` (or connecting the GitHub repo to Vercel) deploys the React SPA to Vercel's CDN and the FastAPI backend (with the bundled `jan2026_bmrs_cache.json.gz` dataset) as a Python Serverless Function under `/api/*`.
- **Option B: Heroku Deployment**
  - `Procfile`, `runtime.txt`, `requirements.txt`, and `Dockerfile` (`heroku.yml` compatible) are pre-configured so pushing to Heroku (`git push heroku main` or `heroku container:push web && heroku container:release web`) runs the unified FastAPI + React SPA container.

---

## J. DOCUMENTATION AND FINAL DELIVERABLES

### Required Deliverables Checklist from Assignment
1. **Public Anonymous GitHub Repository**:
   - Assignment states: *"Please create a public github repo (with an anonymous repo name e.g., a random string like `kjhwr`) to submit your code."*
   - Must contain `README.md` with:
     - Explicit mention of AI tools used (`Claude Code / Claude Opus`).
     - Details of all files and directories present.
     - Step-by-step instructions on how to start the application (Docker & local).
     - Link placeholder/URL to the deployed Vercel/Heroku app.
2. **Deployed Sample Application (Vercel or Heroku)**:
   - Accessible in an incognito browser window without login walls.
3. **Unlisted YouTube Video Demo (Max 10 Minutes Total)**:
   - **Part 1 (Max 5 minutes)**: Client Presentation & Pitch — presenting the portal and quantitative January 2026 analysis to the UK energy utility day-ahead trading team as the output of a pilot project.
   - **Part 2 (Max 5 minutes)**: Technical Lead Review — explaining the software architecture, design, quantitative analysis methodology, codebase structure, and key development practices.
   - `DEPLOYMENT_AND_SUBMISSION.md` must include a complete, word-for-word 10-minute speaker script and screen-recording choreography for Part 1 and Part 2, synced directly with the live metrics computed from the January 2026 Elexon dataset!

---

## K. RISKS AND RECOVERY PROCEDURES

| Risk / Failure Scenario | Concrete Mitigation & Recovery Procedure |
| :--- | :--- |
| **1. Elexon API Rate Limit (HTTP 429) or Timeout During Data Fetch** | Chunk requests into 5-to-7 day windows with a 0.25s polite delay and exponential backoff retry (`httpx`). Persist the result to `backend/data/jan2026_bmrs_cache.json.gz` so the runtime app never blocks on external API latency. |
| **2. Resolution Mismatch (`FUELHH` 30-min vs `WINDFOR` 60-min)** | Provide both `"half_hourly"` (linear intra-hour interpolation so all 48 Settlement Periods have values) and `"hourly_native"` (strictly un-interpolated `:00` comparisons) in the backend and UI selector, and document both clearly. |
| **3. Missing CLI Credentials for Vercel/Heroku/GitHub in Agent Sandbox** | Check `gh auth status`, `vercel whoami`, `heroku auth:whoami`. If unauthenticated, prepare 100% of deployment configs, test the production build locally, and write exact copy-paste commands in `DEPLOYMENT_AND_SUBMISSION.md`. |
| **4. Docker Daemon Unavailable in Agent Environment** | Always validate the full build and `Dockerfile` syntax; if the sandbox lacks a running Docker daemon, verify the exact same multi-stage steps natively (`npm run build` + `uvicorn backend.main:app`) and document the verification output. |

---

## L. FINAL ACCEPTANCE CHECKLIST

Claude Code must verify and mark each item below with concrete evidence before concluding execution:

| ID | Assignment Requirement | Implementation Location | Verification Method | Required Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **R1** | Fetch national UK actual wind generation from `FUELHH/stream` (`fuelType=WIND`, 30-min resolution) | `backend/bmrs_client.py`, `backend/scripts/fetch_bmrs_data.py` | Run ingestion script & `test_data_integrity.py` | `jan2026_bmrs_cache.json.gz` populated with ~1,500+ actual records | `[ ]` |
| **R2** | Fetch national UK wind forecasts from `WINDFOR/stream` (`startTime`, `publishTime`, `generation`) | `backend/bmrs_client.py`, `backend/scripts/fetch_bmrs_data.py` | Run ingestion script & `test_data_integrity.py` | `jan2026_bmrs_cache.json.gz` populated with ~10,000+ forecast records | `[ ]` |
| **R3** | Scope data to purchase decisions made in January 2026 | `backend/config.py`, `backend/analytics.py` | `pytest backend/tests/test_analytics.py` | Verified decision dates `2026-01-01` to `2026-01-31` & delivery up to `2026-02-01` | `[ ]` |
| **R4** | Clearly show latest renewable generation forecasts available at decision time | `backend/analytics.py`, `frontend/src/components/ProcurementDeskTab.tsx` | `pytest` + API check on `/api/v1/dashboard` | Point-in-time `publishTime <= cutoff` logic verified for both D-1 Cutoff & Horizon modes | `[ ]` |
| **R5** | Quantitatively evaluate forecast accuracy (MAE, RMSE, MBE, MAPE, P90/P95 shortfall, Horizon & Diurnal curves) | `backend/analytics.py`, `frontend/src/components/AccuracyLabTab.tsx` | `pytest backend/tests/test_analytics.py` | All metrics, error histograms, diurnal & horizon curves verified | `[ ]` |
| **R6** | Translate forecast error into day-ahead additional thermal power purchase decisions | `backend/analytics.py`, `frontend/src/components/ProcurementDeskTab.tsx` | `pytest` + UI verification | Residual thermal MW/MWh calculated with Raw, P90, and P95 risk buffers | `[ ]` |
| **R7** | Built with React (frontend) and Python (backend) | `frontend/`, `backend/` | `npm run build` & `pytest` | Clean Vite production build + passing FastAPI tests | `[ ]` |
| **R8** | Dockerized (`Dockerfile` + `docker-compose.yml`) and ready for Vercel/Heroku deployment | `Dockerfile`, `docker-compose.yml`, `vercel.json`, `Procfile` | Build & server smoke test | Production server serves both SPA and `/api/v1/*` on port 8000 | `[ ]` |
| **R9** | Complete `README.md` (with AI tool disclosure, file tree, startup steps) & 10-min Video Pitch/Tech Guide | `README.md`, `DEPLOYMENT_AND_SUBMISSION.md`, `ExecutivePitchTab.tsx` | File inspection | Complete documentation and exact numbers from Jan 2026 analysis included | `[ ]` |

---
**END OF SPECIFICATION — CLAUDE CODE: BEGIN EXECUTION AT MILESTONE 1 IMMEDIATELY.**