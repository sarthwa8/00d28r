"""Pydantic v2 response models for the /api/v1 contract."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel

Num = Optional[float]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    data_source: str
    fetched_at_utc: Optional[str]
    actuals_count: int
    forecasts_raw_count: int
    forecasts_half_hourly_count: int
    publish_runs: int
    actuals_range: list[Optional[str]]
    forecast_publish_range: list[Optional[str]]
    delivery_window: list[str]
    source_urls: dict[str, str]


class DashboardMeta(BaseModel):
    start_date: str
    end_date: str
    selection_mode: str
    cutoff_hour_utc: int
    min_horizon_hours: float
    resolution: str
    demand_mw: float
    risk_posture: str
    period_hours: float
    settlement_periods: int
    matched_sample_count: int
    total_actual_mwh: Num
    total_forecast_mwh: Num
    total_risk_adjusted_wind_mwh: Num
    total_recommended_thermal_mwh: Num
    total_actual_thermal_needed_mwh: Num
    total_residual_shortfall_mwh: Num
    total_over_procured_mwh: Num
    all_pairs_sample_count: int
    data_source: str
    data_fetched_at_utc: Optional[str]


class Kpis(BaseModel):
    sample_count: int
    mae_mw: Num
    rmse_mw: Num
    mbe_mw: Num
    mape_pct: Num
    nmae_pct: Num
    p05_error_mw: Num
    p10_error_mw: Num
    p25_error_mw: Num
    p50_error_mw: Num
    p75_error_mw: Num
    p90_error_mw: Num
    p95_error_mw: Num
    p90_shortfall_buffer_mw: Num
    p95_shortfall_buffer_mw: Num
    max_overforecast_mw: Num
    max_overforecast_time: Optional[str]
    max_underforecast_mw: Num
    max_underforecast_time: Optional[str]
    avg_actual_mw: Num
    peak_actual_mw: Num
    min_actual_mw: Num
    avg_forecast_mw: Num
    avg_lead_time_hours: Num
    shortfall_period_pct: Num
    skewness: Num
    excess_kurtosis: Num
    std_mw: Num


class TimeseriesPoint(BaseModel):
    startTime: str
    settlementDate: str
    settlementPeriod: int
    actual_mw: Num
    forecast_mw: Num
    publishTime: Optional[str]
    horizon_hours: Num
    is_interpolated: bool
    error_mw: Num
    abs_error_mw: Num
    p10_bound_mw: Num
    p90_bound_mw: Num
    risk_adjusted_wind_mw: Num
    thermal_procurement_mw: Num
    actual_thermal_needed_mw: Num


class HorizonBucket(BaseModel):
    bucket_label: str
    min_h: float
    max_h: float
    sample_count: int
    mae_mw: Num
    rmse_mw: Num
    mbe_mw: Num
    mape_pct: Num
    p90_shortfall_mw: Num
    p95_shortfall_mw: Num


class DiurnalBucket(BaseModel):
    hour_utc: int
    label: str
    sample_count: int
    avg_actual_mw: Num
    avg_forecast_mw: Num
    mae_mw: Num
    mbe_mw: Num
    p10_error_mw: Num
    p90_error_mw: Num


class HistogramBin(BaseModel):
    bin_start_mw: Num
    bin_end_mw: Num
    bin_center_mw: Num
    count: int
    percentage: Num


class DailySummary(BaseModel):
    date: str
    decision_date: str
    settlement_periods: int
    actual_mwh: Num
    forecast_mwh: Num
    risk_adjusted_wind_mwh: Num
    recommended_thermal_mwh: Num
    residual_shortfall_mwh: Num
    mae_mw: Num
    mbe_mw: Num
    max_shortfall_mw: Num


class CalibrationBucket(BaseModel):
    bucket_label: str
    q10: Num
    q50: Num
    q90: Num
    q95: Num
    n: int


class DashboardResponse(BaseModel):
    meta: DashboardMeta
    kpis: Kpis
    timeseries: list[TimeseriesPoint]
    horizon_accuracy: list[HorizonBucket]
    diurnal_profile: list[DiurnalBucket]
    error_distribution: list[HistogramBin]
    daily_summary: list[DailySummary]
    calibration: list[CalibrationBucket]


class Revision(BaseModel):
    publishTime: str
    horizon_hours: Num
    forecast_mw: Num
    error_mw: Num
    is_interpolated: bool
    available_at_day_ahead_cutoff: bool


class ForecastEvolutionResponse(BaseModel):
    target_time: str
    settlement_period: int
    actual_mw: Num
    day_ahead_cutoff: str
    day_ahead_selected_publish_time: Optional[str]
    revisions: list[Revision]
