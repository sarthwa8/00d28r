"""Domain analytics: point-in-time forecast selection, error metrics and procurement maths.

Sign convention throughout: error e = forecast - actual (MW).
  e > 0  over-forecast  -> wind shortfall, utility is short and exposed to imbalance prices
  e < 0  under-forecast -> surplus wind, utility over-procured thermal
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

import numpy as np
import pandas as pd

from backend import config

SelectionMode = Literal["day_ahead_cutoff", "horizon_hours"]
Resolution = Literal["half_hourly", "hourly_native"]
RiskPosture = Literal["raw", "p90", "p95"]

QUANTILES = {"p05": 5, "p10": 10, "p25": 25, "p50": 50, "p75": 75, "p90": 90, "p95": 95}


@dataclass(frozen=True)
class DashboardParams:
    start_date: date
    end_date: date
    selection_mode: SelectionMode = "day_ahead_cutoff"
    cutoff_hour_utc: int = config.DEFAULT_CUTOFF_HOUR_UTC
    min_horizon_hours: float = config.DEFAULT_MIN_HORIZON_HOURS
    resolution: Resolution = "half_hourly"
    demand_mw: float = config.DEFAULT_DEMAND_MW
    risk_posture: RiskPosture = "p90"

    @property
    def period_hours(self) -> float:
        return 0.5 if self.resolution == "half_hourly" else 1.0


# --------------------------------------------------------------------------- helpers


def _f(x) -> float | None:
    """Float with NaN/inf -> None, rounded for compact JSON."""
    if x is None:
        return None
    x = float(x)
    return None if not np.isfinite(x) else round(x, 2)


def _iso(ts: pd.Timestamp | None) -> str | None:
    if ts is None or pd.isna(ts):
        return None
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def delivery_bounds(start: date, end: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    """Inclusive [first SP start, last SP start] of a delivery date range (UTC == GMT in January)."""
    lo = pd.Timestamp(start, tz="UTC")
    hi = pd.Timestamp(end + timedelta(days=1), tz="UTC") - pd.Timedelta(minutes=30)
    return lo, hi


def settlement_period(ts: pd.Series) -> pd.Series:
    # GMT applies throughout Jan 2026, so SP = half-hour index of the UTC day + 1 (no clock-change days).
    return ts.dt.hour * 2 + ts.dt.minute // 30 + 1


def forecasts_for_resolution(raw: pd.DataFrame, half: pd.DataFrame, resolution: Resolution) -> pd.DataFrame:
    return half if resolution == "half_hourly" else raw


def actuals_for_resolution(actuals: pd.DataFrame, resolution: Resolution) -> pd.DataFrame:
    if resolution == "half_hourly":
        return actuals
    # hourly_native compares only the :00 settlement periods that WINDFOR actually publishes.
    return actuals[actuals["startTime"].dt.minute == 0]


def bucket_label(h: pd.Series) -> pd.Series:
    labels = [b[0] for b in config.HORIZON_BUCKETS]
    edges = [b[1] for b in config.HORIZON_BUCKETS] + [config.HORIZON_BUCKETS[-1][2]]
    out = pd.cut(h, bins=edges, labels=labels, right=False, include_lowest=True)
    # Include the closing edge (exactly 48h) in the last bucket.
    out = out.astype(object)
    out[h == edges[-1]] = labels[-1]
    return out


# --------------------------------------------------------------------------- selection


def select_as_of_forecasts(
    forecasts: pd.DataFrame,
    start_times: pd.Series | pd.DatetimeIndex,
    mode: SelectionMode,
    cutoff_hour_utc: int = config.DEFAULT_CUTOFF_HOUR_UTC,
    min_horizon_hours: float = config.DEFAULT_MIN_HORIZON_HOURS,
    max_horizon_hours: float = config.EVAL_MAX_HORIZON_HOURS,
) -> pd.DataFrame:
    """For each target startTime return the latest forecast that was available at its decision cutoff.

    day_ahead_cutoff: cutoff = (delivery date - 1 day) + cutoff_hour; eligible iff publishTime <= cutoff.
    horizon_hours:    eligible iff startTime - max_horizon <= publishTime <= startTime - min_horizon.
    Returns columns startTime, publishTime, forecast_mw, horizon_hours, is_interpolated, cutoff.
    """
    targets = pd.DatetimeIndex(pd.Series(start_times).unique())
    cols = ["startTime", "publishTime", "forecast_mw", "horizon_hours", "is_interpolated", "cutoff"]
    if len(targets) == 0 or forecasts.empty:
        return pd.DataFrame(columns=cols)

    cand = forecasts[forecasts["startTime"].isin(targets)]
    if mode == "day_ahead_cutoff":
        cutoff = cand["startTime"].dt.floor("D") - pd.Timedelta(days=1) + pd.Timedelta(hours=cutoff_hour_utc)
        eligible = cand["publishTime"] <= cutoff
    elif mode == "horizon_hours":
        cutoff = cand["startTime"] - pd.Timedelta(hours=min_horizon_hours)
        floor = cand["startTime"] - pd.Timedelta(hours=max_horizon_hours)
        eligible = (cand["publishTime"] <= cutoff) & (cand["publishTime"] >= floor)
    else:
        raise ValueError(f"unknown selection mode {mode!r}")

    cand = cand.assign(cutoff=cutoff)[eligible]
    if cand.empty:
        return pd.DataFrame(columns=cols)
    best = cand.loc[cand.groupby("startTime")["publishTime"].idxmax()]
    best = best.rename(columns={"generation": "forecast_mw"})
    return best[cols].sort_values("startTime").reset_index(drop=True)


def all_pairs(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    lo: pd.Timestamp,
    hi: pd.Timestamp,
    max_horizon_hours: float = config.EVAL_MAX_HORIZON_HOURS,
) -> pd.DataFrame:
    """Every (forecast run, target) pair inside [lo, hi] with 0 <= horizon <= max, joined to actuals."""
    f = forecasts[
        (forecasts["startTime"] >= lo)
        & (forecasts["startTime"] <= hi)
        & (forecasts["horizon_hours"] >= 0)
        & (forecasts["horizon_hours"] <= max_horizon_hours)
    ]
    m = f.merge(actuals[["startTime", "generation"]].rename(columns={"generation": "actual_mw"}), on="startTime")
    m = m.rename(columns={"generation": "forecast_mw"})
    m["error_mw"] = m["forecast_mw"] - m["actual_mw"]
    return m


# --------------------------------------------------------------------------- metrics


def error_metrics(forecast: np.ndarray, actual: np.ndarray) -> dict[str, float | None]:
    forecast = np.asarray(forecast, dtype=float)
    actual = np.asarray(actual, dtype=float)
    mask = np.isfinite(forecast) & np.isfinite(actual)
    f, a = forecast[mask], actual[mask]
    n = int(mask.sum())
    if n == 0:
        out: dict[str, float | None] = {k: None for k in ("mae", "rmse", "mbe", "mape", "nmae")}
        out.update({k: None for k in QUANTILES})
        out.update({"p90_shortfall_buffer": None, "p95_shortfall_buffer": None, "n": 0})
        return out
    e = f - a
    q = np.percentile(e, list(QUANTILES.values()))
    peak = a.max()
    out = {
        "n": n,
        "mae": float(np.mean(np.abs(e))),
        "rmse": float(np.sqrt(np.mean(e**2))),
        "mbe": float(np.mean(e)),
        "mape": float(100.0 * np.mean(np.abs(e) / np.maximum(a, config.MAPE_FLOOR_MW))),
        "nmae": float(100.0 * np.mean(np.abs(e)) / peak) if peak > 0 else None,
    }
    out.update({k: float(v) for k, v in zip(QUANTILES, q)})
    out["p90_shortfall_buffer"] = max(0.0, out["p90"])
    out["p95_shortfall_buffer"] = max(0.0, out["p95"])
    return out


def bucket_error_quantiles(pairs: pd.DataFrame) -> dict[str, dict[str, float]]:
    """Empirical (q10, q90, q95) of signed error per lead-time bucket - the calibration table."""
    if pairs.empty:
        return {}
    labelled = pairs.assign(bucket=bucket_label(pairs["horizon_hours"])).dropna(subset=["bucket"])
    out = {}
    for label, grp in labelled.groupby("bucket"):
        e = grp["error_mw"].to_numpy()
        q10, q90, q95 = np.percentile(e, [10, 90, 95])
        out[str(label)] = {"q10": float(q10), "q90": float(q90), "q95": float(q95), "n": int(len(e))}
    return out


def risk_adjusted_wind(
    forecast_mw: pd.Series, buckets: pd.Series, calib: dict[str, dict[str, float]], posture: RiskPosture
) -> pd.Series:
    """Wind the desk can rely on: forecast minus the horizon-conditional shortfall quantile.

    The buffer is clipped at >= 0 so a historically under-forecasting bucket never makes the
    desk rely on *more* wind than was forecast.
    """
    if posture == "raw":
        return forecast_mw.astype(float)
    key = "q90" if posture == "p90" else "q95"
    buffer = buckets.map(lambda b: max(0.0, calib.get(b, {}).get(key, 0.0)) if isinstance(b, str) else 0.0)
    return (forecast_mw - buffer.astype(float)).clip(lower=0.0)


def thermal_procurement(demand_mw: float, relied_wind_mw: pd.Series) -> pd.Series:
    return (demand_mw - relied_wind_mw).clip(lower=0.0)


# --------------------------------------------------------------------------- calibration cache

_calibration_cache: dict[tuple[int, str], dict[str, dict[str, float]]] = {}


def calibration_table(store, resolution: Resolution) -> dict[str, dict[str, float]]:
    """Horizon-bucket error quantiles over the whole January 2026 delivery window (cached per data version)."""
    key = (store.version, resolution)
    if key not in _calibration_cache:
        actuals, raw, half = store.frames()
        lo, hi = delivery_bounds(date.fromisoformat(config.DELIVERY_MIN_DATE), date.fromisoformat(config.DELIVERY_MAX_DATE))
        pairs = all_pairs(forecasts_for_resolution(raw, half, resolution), actuals_for_resolution(actuals, resolution), lo, hi)
        _calibration_cache[key] = bucket_error_quantiles(pairs)
    return _calibration_cache[key]


# --------------------------------------------------------------------------- dashboard


def _horizon_accuracy(pairs: pd.DataFrame) -> list[dict]:
    labelled = pairs.assign(bucket=bucket_label(pairs["horizon_hours"])) if not pairs.empty else pairs
    rows = []
    for label, lo, hi in config.HORIZON_BUCKETS:
        grp = labelled[labelled["bucket"] == label] if not labelled.empty else labelled
        m = error_metrics(grp["forecast_mw"].to_numpy(), grp["actual_mw"].to_numpy()) if len(grp) else error_metrics([], [])
        rows.append(
            {
                "bucket_label": label,
                "min_h": lo,
                "max_h": hi,
                "sample_count": m["n"],
                "mae_mw": _f(m["mae"]),
                "rmse_mw": _f(m["rmse"]),
                "mbe_mw": _f(m["mbe"]),
                "mape_pct": _f(m["mape"]),
                "p90_shortfall_mw": _f(m["p90_shortfall_buffer"]),
                "p95_shortfall_mw": _f(m["p95_shortfall_buffer"]),
            }
        )
    return rows


def _diurnal(matched: pd.DataFrame) -> list[dict]:
    rows = []
    hours = matched["startTime"].dt.hour if not matched.empty else pd.Series(dtype=int)
    for h in range(24):
        grp = matched[hours == h] if not matched.empty else matched
        e = grp["error_mw"].to_numpy() if len(grp) else np.array([])
        rows.append(
            {
                "hour_utc": h,
                "label": f"{h:02d}:00",
                "sample_count": int(len(e)),
                "avg_actual_mw": _f(grp["actual_mw"].mean()) if len(grp) else None,
                "avg_forecast_mw": _f(grp["forecast_mw"].mean()) if len(grp) else None,
                "mae_mw": _f(np.mean(np.abs(e))) if len(e) else None,
                "mbe_mw": _f(np.mean(e)) if len(e) else None,
                "p10_error_mw": _f(np.percentile(e, 10)) if len(e) else None,
                "p90_error_mw": _f(np.percentile(e, 90)) if len(e) else None,
            }
        )
    return rows


def _histogram(errors: np.ndarray, bins: int = 20) -> list[dict]:
    if len(errors) == 0:
        return []
    counts, edges = np.histogram(errors, bins=bins)
    total = counts.sum()
    return [
        {
            "bin_start_mw": _f(edges[i]),
            "bin_end_mw": _f(edges[i + 1]),
            "bin_center_mw": _f((edges[i] + edges[i + 1]) / 2),
            "count": int(counts[i]),
            "percentage": _f(100.0 * counts[i] / total),
        }
        for i in range(len(counts))
    ]


def _distribution_shape(errors: np.ndarray) -> dict:
    if len(errors) < 3:
        return {"skewness": None, "excess_kurtosis": None, "std_mw": None}
    s = pd.Series(errors)
    return {"skewness": _f(s.skew()), "excess_kurtosis": _f(s.kurt()), "std_mw": _f(s.std())}


def build_dashboard(store, p: DashboardParams) -> dict:
    actuals_all, raw, half = store.frames()
    forecasts = forecasts_for_resolution(raw, half, p.resolution)
    actuals = actuals_for_resolution(actuals_all, p.resolution)
    lo, hi = delivery_bounds(p.start_date, p.end_date)

    window = actuals[(actuals["startTime"] >= lo) & (actuals["startTime"] <= hi)][["startTime", "generation"]]
    window = window.rename(columns={"generation": "actual_mw"})
    selected = select_as_of_forecasts(
        forecasts, window["startTime"], p.selection_mode, p.cutoff_hour_utc, p.min_horizon_hours
    )
    ts = window.merge(selected, on="startTime", how="left").sort_values("startTime").reset_index(drop=True)
    ts["is_interpolated"] = ts["is_interpolated"].fillna(False).astype(bool)
    ts["error_mw"] = ts["forecast_mw"] - ts["actual_mw"]
    ts["abs_error_mw"] = ts["error_mw"].abs()
    ts["bucket"] = bucket_label(ts["horizon_hours"])

    calib = calibration_table(store, p.resolution)
    q10 = ts["bucket"].map(lambda b: calib.get(b, {}).get("q10", np.nan) if isinstance(b, str) else np.nan).astype(float)
    q90 = ts["bucket"].map(lambda b: calib.get(b, {}).get("q90", np.nan) if isinstance(b, str) else np.nan).astype(float)
    ts["p10_bound_mw"] = (ts["forecast_mw"] - q90).clip(lower=0.0)
    ts["p90_bound_mw"] = (ts["forecast_mw"] - q10).clip(lower=0.0)
    ts["risk_adjusted_wind_mw"] = risk_adjusted_wind(ts["forecast_mw"], ts["bucket"], calib, p.risk_posture)
    ts["thermal_procurement_mw"] = thermal_procurement(p.demand_mw, ts["risk_adjusted_wind_mw"])
    ts["actual_thermal_needed_mw"] = thermal_procurement(p.demand_mw, ts["actual_mw"])
    # Positive = thermal bought day-ahead fell short of what actual wind required (imbalance exposure).
    ts["residual_shortfall_mw"] = (ts["actual_thermal_needed_mw"] - ts["thermal_procurement_mw"]).clip(lower=0.0)

    matched = ts.dropna(subset=["forecast_mw", "actual_mw"])
    m = error_metrics(matched["forecast_mw"].to_numpy(), matched["actual_mw"].to_numpy())
    errors = matched["error_mw"].to_numpy()

    kpis = {
        "sample_count": m["n"],
        "mae_mw": _f(m["mae"]),
        "rmse_mw": _f(m["rmse"]),
        "mbe_mw": _f(m["mbe"]),
        "mape_pct": _f(m["mape"]),
        "nmae_pct": _f(m["nmae"]),
        **{f"{k}_error_mw": _f(m[k]) for k in QUANTILES},
        "p90_shortfall_buffer_mw": _f(m["p90_shortfall_buffer"]),
        "p95_shortfall_buffer_mw": _f(m["p95_shortfall_buffer"]),
        "max_overforecast_mw": None,
        "max_overforecast_time": None,
        "max_underforecast_mw": None,
        "max_underforecast_time": None,
        "avg_actual_mw": _f(window["actual_mw"].mean()) if len(window) else None,
        "peak_actual_mw": _f(window["actual_mw"].max()) if len(window) else None,
        "min_actual_mw": _f(window["actual_mw"].min()) if len(window) else None,
        "avg_forecast_mw": _f(matched["forecast_mw"].mean()) if len(matched) else None,
        "avg_lead_time_hours": _f(matched["horizon_hours"].mean()) if len(matched) else None,
        "shortfall_period_pct": _f(100.0 * np.mean(errors > 0)) if len(errors) else None,
        **_distribution_shape(errors),
    }
    if len(matched):
        i_over, i_under = matched["error_mw"].idxmax(), matched["error_mw"].idxmin()
        kpis["max_overforecast_mw"] = _f(max(0.0, matched.at[i_over, "error_mw"]))
        kpis["max_overforecast_time"] = _iso(matched.at[i_over, "startTime"])
        kpis["max_underforecast_mw"] = _f(max(0.0, -matched.at[i_under, "error_mw"]))
        kpis["max_underforecast_time"] = _iso(matched.at[i_under, "startTime"])

    ph = p.period_hours
    ts["delivery_date"] = ts["startTime"].dt.strftime("%Y-%m-%d")
    daily = []
    for d, grp in ts.groupby("delivery_date", sort=True):
        g = grp.dropna(subset=["forecast_mw"])
        daily.append(
            {
                "date": d,
                "decision_date": (date.fromisoformat(d) - timedelta(days=1)).isoformat(),
                "settlement_periods": int(len(grp)),
                "actual_mwh": _f(grp["actual_mw"].sum() * ph),
                "forecast_mwh": _f(g["forecast_mw"].sum() * ph) if len(g) else None,
                "risk_adjusted_wind_mwh": _f(g["risk_adjusted_wind_mw"].sum() * ph) if len(g) else None,
                "recommended_thermal_mwh": _f(g["thermal_procurement_mw"].sum() * ph) if len(g) else None,
                "residual_shortfall_mwh": _f(g["residual_shortfall_mw"].sum() * ph) if len(g) else None,
                "mae_mw": _f(g["abs_error_mw"].mean()) if len(g) else None,
                "mbe_mw": _f(g["error_mw"].mean()) if len(g) else None,
                "max_shortfall_mw": _f(max(0.0, g["error_mw"].max())) if len(g) else None,
            }
        )

    timeseries = [
        {
            "startTime": _iso(r.startTime),
            "settlementDate": r.startTime.strftime("%Y-%m-%d"),
            "settlementPeriod": int(r.startTime.hour * 2 + r.startTime.minute // 30 + 1),
            "actual_mw": _f(r.actual_mw),
            "forecast_mw": _f(r.forecast_mw),
            "publishTime": _iso(r.publishTime) if not pd.isna(r.publishTime) else None,
            "horizon_hours": _f(r.horizon_hours),
            "is_interpolated": bool(r.is_interpolated),
            "error_mw": _f(r.error_mw),
            "abs_error_mw": _f(r.abs_error_mw),
            "p10_bound_mw": _f(r.p10_bound_mw),
            "p90_bound_mw": _f(r.p90_bound_mw),
            "risk_adjusted_wind_mw": _f(r.risk_adjusted_wind_mw),
            "thermal_procurement_mw": _f(r.thermal_procurement_mw),
            "actual_thermal_needed_mw": _f(r.actual_thermal_needed_mw),
        }
        for r in ts.itertuples(index=False)
    ]

    pairs = all_pairs(forecasts, actuals, lo, hi)
    meta = {
        "start_date": p.start_date.isoformat(),
        "end_date": p.end_date.isoformat(),
        "selection_mode": p.selection_mode,
        "cutoff_hour_utc": p.cutoff_hour_utc,
        "min_horizon_hours": p.min_horizon_hours,
        "resolution": p.resolution,
        "demand_mw": p.demand_mw,
        "risk_posture": p.risk_posture,
        "period_hours": ph,
        "settlement_periods": int(len(ts)),
        "matched_sample_count": int(len(matched)),
        "total_actual_mwh": _f(ts["actual_mw"].sum() * ph),
        "total_forecast_mwh": _f(matched["forecast_mw"].sum() * ph),
        "total_risk_adjusted_wind_mwh": _f(matched["risk_adjusted_wind_mw"].sum() * ph),
        "total_recommended_thermal_mwh": _f(matched["thermal_procurement_mw"].sum() * ph),
        "total_actual_thermal_needed_mwh": _f(matched["actual_thermal_needed_mw"].sum() * ph),
        "total_residual_shortfall_mwh": _f(matched["residual_shortfall_mw"].sum() * ph),
        "all_pairs_sample_count": int(len(pairs)),
        "data_source": store.source,
        "data_fetched_at_utc": store.metadata.get("fetched_at_utc"),
    }

    return {
        "meta": meta,
        "kpis": kpis,
        "timeseries": timeseries,
        "horizon_accuracy": _horizon_accuracy(pairs),
        "diurnal_profile": _diurnal(matched),
        "error_distribution": _histogram(errors),
        "daily_summary": daily,
        "calibration": [
            {"bucket_label": label, **{k: _f(v) if k != "n" else v for k, v in calib.get(label, {}).items()}}
            for label, _, _ in config.HORIZON_BUCKETS
            if label in calib
        ],
    }


def forecast_evolution(store, target: pd.Timestamp, cutoff_hour_utc: int = config.DEFAULT_CUTOFF_HOUR_UTC) -> dict:
    actuals, raw, half = store.frames()
    forecasts = half if target.minute == 30 else raw
    revs = forecasts[
        (forecasts["startTime"] == target) & (forecasts["horizon_hours"] <= config.EVAL_MAX_HORIZON_HOURS)
    ].sort_values("publishTime")
    hit = actuals.loc[actuals["startTime"] == target, "generation"]
    actual = float(hit.iloc[0]) if len(hit) else None
    da_cutoff = target.floor("D") - pd.Timedelta(days=1) + pd.Timedelta(hours=cutoff_hour_utc)
    eligible = revs[revs["publishTime"] <= da_cutoff]
    da_pub = eligible["publishTime"].max() if len(eligible) else None
    return {
        "target_time": _iso(target),
        "settlement_period": int(target.hour * 2 + target.minute // 30 + 1),
        "actual_mw": _f(actual),
        "day_ahead_cutoff": _iso(da_cutoff),
        "day_ahead_selected_publish_time": _iso(da_pub) if da_pub is not None else None,
        "revisions": [
            {
                "publishTime": _iso(r.publishTime),
                "horizon_hours": _f(r.horizon_hours),
                "forecast_mw": _f(r.generation),
                "error_mw": _f(r.generation - actual) if actual is not None else None,
                "is_interpolated": bool(r.is_interpolated),
                "available_at_day_ahead_cutoff": bool(r.publishTime <= da_cutoff),
            }
            for r in revs.itertuples(index=False)
        ],
    }
