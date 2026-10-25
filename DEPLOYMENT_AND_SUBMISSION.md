# Deployment & Submission Guide

## Status

| Deliverable | Status |
|---|---|
| Application code, tests, Docker | ✅ Done and verified locally (pytest 39/39, Vitest 9/9, Vite build, `docker compose up` healthy) |
| Public GitHub repo (anonymous name) | ✅ https://github.com/sarthwa8/00d28r (public, opens without login) |
| Vercel deployment | ✅ https://windsight-00d28r.vercel.app (production, deployed with the Vercel CLI; page and API verified without login) |
| YouTube video (unlisted, ≤10 min) | ⏳ Must be recorded by a person. Script below |
| Submission form | ⏳ Owner submits at https://forms.cloud.microsoft/r/Ljmf1aWESK |

---

## 1. Publish the repository (anonymous name)

```bash
cd gridbrix
gh repo create "$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6)" --public --source=. --remote=origin --push
```

Before pushing, confirm that `git ls-files` contains no `.env`, `.venv`, `node_modules` or `.docx` files (all are git-ignored).

## 2. Deploy to Vercel (recommended)

**Option A, Git integration:** in the Vercel dashboard click **Add New → Project**, import the repo, leave the settings
as they are (`vercel.json` supplies the build command and output directory), then click **Deploy**.

**Option B, CLI:**
```bash
npx vercel@latest login
npx vercel@latest --prod
```

`vercel.json` sets `"framework": null` on purpose. Otherwise Vercel auto-detects the FastAPI preset, which routes every path through the
function and skips the static SPA build. How it runs on Vercel: `frontend/dist` is served from the CDN. `/api/*` is rewritten to the Python function
`api/index.py`, which imports the FastAPI app and bundles `backend/**`, including the data snapshot.

Verify the deployment in an incognito window:
```bash
curl -s https://<your-app>.vercel.app/api/v1/health
curl -s -o /dev/null -w "%{http_code}\n" https://<your-app>.vercel.app/
```
If Vercel Deployment Protection is enabled on the team, turn it off for Production (Project → Settings → Deployment Protection),
so the reviewers can open the link without logging in.

## 3. Alternative: Heroku

```bash
heroku create <name>
heroku stack:set container      # uses heroku.yml → Dockerfile
git push heroku main
```
Or use the Python buildpack (`Procfile` + `runtime.txt`). In that case build `frontend/dist` first, because the buildpack does not run npm.

## 4. Submission checklist

- [ ] Repo is public with an anonymous name, and the README contains the live app link (replace the "not yet deployed" line).
- [ ] App opens in an incognito window, all three tabs load, and the charts render.
- [ ] Video is unlisted on YouTube, ≤10 minutes, and the link opens in an incognito window.
- [ ] Form submitted with: repo URL, app URL, video URL.

---

## 5. Video script (≤10 minutes)

Record at 1440×900 or larger, starting on the deployed app. The figures below are from the canonical scenario:
*Jan 2026 decisions (delivery 2 Jan – 1 Feb), D-1 10:00 UTC cutoff, 25 GW demand*.

### Part 1: Client pitch (≈4:30)

**[0:00 · Client briefing: headline and gap chart]**
"Every morning your desk has to decide how much power to buy for tomorrow, and the biggest unknown is wind. We replayed every
day-ahead decision you made in January 2026, using exactly the wind forecast that was published before the 11:00 auction. Then we
checked it against what the wind actually did. Here's the headline: the forecast you trade on was off by about **2,000 MW on
average**, and **85% of the time it was too high**."

**[0:40 · Headline figures under the chart, then "Where the risk concentrates"]**
"That last point matters most. This isn't random noise: the forecast is optimistic by about **1,700 MW** on average. When wind
under-delivers, you're short and exposed to imbalance prices. To be covered 90% of the time you'd need about **4,200 MW** of extra
thermal; for 95%, about **5,300 MW**. Accuracy also degrades with lead time: from about 1,650 MW error four hours out to 2,230 MW
at two days out. And errors peak overnight, around 03:00."

**[1:30 · "What the bias cost the desk" bars]**
"So what should you do? This table shows what four buying strategies would actually have done in January. Buying against the raw
forecast left you about **1.4 TWh short**. Correcting for the known bias balances the book almost exactly, to within **55 GWh**.
The P90 buffer almost eliminates shortfalls but leaves you about 1.9 TWh long. The portal makes that trade-off a dial you control."

**[2:15 · Procurement desk]**
"This is the desk your traders would use daily. Pick a delivery day or a whole week, and the decision rule, for example 10:00 on D-1.
The blue line is the forecast you'd have had. Green is what happened. The shaded band is the realistic range given how far ahead the forecast was.
Set your demand and posture, and you get the thermal buy per half-hour."
*(Switch posture Raw → De-bias → P90 and watch the summary cards change; select a single day, e.g. 28 Jan, the worst day.)*

**[3:15 · Schedule table + CSV, then click Revisions]**
"Here's the 48-period schedule, which exports straight to your bid sheet. Click any period to see how the forecast evolved run by run.
For example, here's the worst miss of the month, 12 January at 01:00. The forecast you had at the cutoff was about 6.9 GW too high."

**[4:00 · Error lab]**
"And the Error lab is the evidence behind the buffers: error by lead time, by hour of day, and the full distribution, so the numbers
your risk team signs off are fully transparent. Our recommendation: make de-biasing the default and switch to P90 when imbalance prices look tight.
We can then extend this pilot to solar and demand forecasts."

### Part 2: Tech-lead review (≈4:30)

**[5:00 · Tech review: click through the six pipeline steps, then the repo tree]**
"Architecture in one sentence: a Python ingestion script pulls FUELHH and WINDFOR from Elexon's public API into a deterministic, gzipped
snapshot. A FastAPI service loads it into pandas and computes everything per request. A React and TypeScript SPA renders it.
The repo has `backend/` (client, store, analytics, schemas, main), `frontend/src` (one component per workspace), and the deployment configs at the root."

**[5:40 · `backend/bmrs_client.py`, `data_store.py`]**
"The client chunks requests by week, retries with exponential backoff on 429s and 5xx errors, filters to WIND and to 0–72h horizons, and deduplicates.
We got 1,632 half-hourly actuals and 15,679 forecast rows from 280 publish runs, with all 48 periods present for every delivery day.
WINDFOR is hourly, so the `:30` points are linearly interpolated *within each run only*. There's also an `hourly_native` mode that skips interpolation, so you can check the effect."

**[6:30 · Tech review no-look-ahead timeline (drag the cutoff 10:00 → 18:00), then `backend/analytics.py::select_as_of_forecasts`]**
"The core correctness rule is no look-ahead. For each half-hour we compute the cutoff, either D-1 plus the gate-closure hour
or start time minus a minimum lead time. We drop every forecast published after it and take the latest remaining one with a groupby-idxmax.
That's fully vectorised: a month of data takes about 60 ms. On screen, for the month's worst half-hour, 12 of 16 runs are usable at 10:00
and the engine picks the 09:30 run, 6,857 MW too high. Drag the cutoff to 18:00 and it picks the 15:30 run, which was even worse at
7,097 MW: a later forecast isn't automatically a better one."

**[7:10 · metrics + calibration]**
"The error convention is forecast minus actual, so positive means a shortfall. MAE, RMSE, bias, and MAPE with a 100 MW floor so wind lulls don't explode it.
The buffers come from signed-error quantiles per lead-time bucket over all forecast–actual pairs. A buffer is clipped at zero, so we never
rely on *more* wind than the forecast. Thermal buy is demand minus relied-upon wind; short and long volumes reconcile exactly with the net, and a test checks that."

**[7:50 · `backend/tests`, terminal running pytest + vitest]**
"There are 39 pytest tests: synthetic vectors with hand-computed answers, as-of invariants asserted on the real data, data-integrity checks on the snapshot,
and the API contract including 400s and 422s. On the frontend, Vitest covers rendering, controls, the modal and the CSV export. TypeScript is strict, and
the Pydantic models are mirrored as TS types."

**[8:40 · Dockerfile / vercel.json]**
"For deployment, a multi-stage Dockerfile builds the SPA with Node and serves SPA and API from a single uvicorn process, with a health check and a non-root user.
`docker compose up --build` is the one-liner. On Vercel, the same FastAPI app runs as a Python function behind `/api`, and the SPA sits on the CDN."

**[9:20 · close]**
"Known limitations: the buffers are calibrated in-sample, demand is a flat input, and the bias cause, probably curtailment, needs validating.
Next steps would be a trailing calibration window, real demand forecasts, and scheduled refreshes. AI tooling, Claude Code, was used and is disclosed in the README. Thanks."
