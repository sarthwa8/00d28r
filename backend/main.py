"""FastAPI application: /api/v1 analytics endpoints plus static serving of the built React SPA."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import date
from typing import Literal

import pandas as pd
from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend import analytics, config
from backend.data_store import store
from backend.schemas import DashboardResponse, ForecastEvolutionResponse, HealthResponse

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("windsight")


def ensure_loaded() -> None:
    if store.version == 0:
        store.load()


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_loaded()
    yield


app = FastAPI(
    title="WindSight GB API",
    description="UK day-ahead wind forecast accuracy & procurement analytics on Elexon BMRS data (Jan 2026).",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1024)

router = APIRouter(prefix="/api/v1")


def _parse_date(name: str, value: str) -> date:
    try:
        d = date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{name} must be YYYY-MM-DD, got {value!r}")
    lo, hi = date.fromisoformat(config.DELIVERY_MIN_DATE), date.fromisoformat(config.DELIVERY_MAX_DATE)
    if not lo <= d <= hi:
        raise HTTPException(status_code=400, detail=f"{name} must be within {lo} .. {hi} (January 2026 decisions)")
    return d


def _health() -> dict:
    actuals, raw, half = store.frames()
    fmt = lambda t: t.strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
    return {
        "status": "ok" if len(actuals) and len(raw) else "degraded",
        "data_source": store.source,
        "fetched_at_utc": store.metadata.get("fetched_at_utc"),
        "actuals_count": len(actuals),
        "forecasts_raw_count": len(raw),
        "forecasts_half_hourly_count": len(half),
        "publish_runs": int(raw["publishTime"].nunique()) if len(raw) else 0,
        "actuals_range": [fmt(actuals["startTime"].min()), fmt(actuals["startTime"].max())] if len(actuals) else [None, None],
        "forecast_publish_range": [fmt(raw["publishTime"].min()), fmt(raw["publishTime"].max())] if len(raw) else [None, None],
        "delivery_window": [config.DELIVERY_MIN_DATE, config.DELIVERY_MAX_DATE],
        "source_urls": {"actuals": config.FUELHH_STREAM_URL, "forecasts": config.WINDFOR_STREAM_URL},
    }


@router.get("/health", response_model=HealthResponse)
def health():
    ensure_loaded()
    return _health()


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    start_date: str = "2026-01-01",
    end_date: str = "2026-01-31",
    selection_mode: Literal["day_ahead_cutoff", "horizon_hours"] = "day_ahead_cutoff",
    cutoff_hour_utc: int = Query(config.DEFAULT_CUTOFF_HOUR_UTC, ge=0, le=23),
    min_horizon_hours: float = Query(config.DEFAULT_MIN_HORIZON_HOURS, ge=0.0, le=48.0),
    resolution: Literal["half_hourly", "hourly_native"] = "half_hourly",
    demand_mw: float = Query(config.DEFAULT_DEMAND_MW, ge=0.0, le=100000.0),
    risk_posture: Literal["raw", "bias", "p90", "p95"] = "p90",
):
    ensure_loaded()
    s, e = _parse_date("start_date", start_date), _parse_date("end_date", end_date)
    if s > e:
        raise HTTPException(status_code=400, detail="start_date must be on or before end_date")
    params = analytics.DashboardParams(
        s, e, selection_mode, cutoff_hour_utc, min_horizon_hours, resolution, demand_mw, risk_posture
    )
    return analytics.build_dashboard(store, params)


@router.get("/forecast-evolution", response_model=ForecastEvolutionResponse)
def forecast_evolution(
    target_time: str = Query(..., description="ISO-8601 UTC settlement period start, e.g. 2026-01-15T18:00:00Z"),
    cutoff_hour_utc: int = Query(config.DEFAULT_CUTOFF_HOUR_UTC, ge=0, le=23),
):
    ensure_loaded()
    try:
        ts = pd.Timestamp(target_time)
        ts = ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"target_time must be ISO-8601, got {target_time!r}")
    if ts.minute not in (0, 30) or ts.second:
        raise HTTPException(status_code=400, detail="target_time must align to a settlement period (:00 or :30)")
    lo, hi = analytics.delivery_bounds(date.fromisoformat(config.DELIVERY_MIN_DATE), date.fromisoformat(config.DELIVERY_MAX_DATE))
    if not lo <= ts <= hi:
        raise HTTPException(status_code=400, detail=f"target_time must be within {lo.date()} .. {hi.date()}")
    return analytics.forecast_evolution(store, ts, cutoff_hour_utc)


@router.post("/system/refresh", response_model=HealthResponse)
def refresh():
    try:
        store.refresh_from_live_api()
    except Exception as exc:  # surface upstream failure without dropping the in-memory dataset
        log.exception("live refresh failed")
        raise HTTPException(status_code=502, detail=f"Elexon refresh failed: {exc}")
    return _health()


app.include_router(router)


@app.exception_handler(404)
async def not_found(request, exc):
    # Unknown /api paths stay JSON 404s; everything else falls back to the SPA shell.
    if request.url.path.startswith("/api") or not (config.FRONTEND_DIST / "index.html").exists():
        detail = getattr(exc, "detail", "Not Found")
        return JSONResponse({"detail": detail}, status_code=404)
    return FileResponse(config.FRONTEND_DIST / "index.html")


if (config.FRONTEND_DIST / "index.html").exists():
    if (config.FRONTEND_DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    def spa_index():
        return FileResponse(config.FRONTEND_DIST / "index.html")

    @app.get("/{path:path}", include_in_schema=False)
    def spa_files(path: str):
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = (config.FRONTEND_DIST / path).resolve()
        if candidate.is_file() and config.FRONTEND_DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(config.FRONTEND_DIST / "index.html")
