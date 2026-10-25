// Mirrors backend/schemas.py (Pydantic v2 response models).
export type SelectionMode = "day_ahead_cutoff" | "horizon_hours";
export type Resolution = "half_hourly" | "hourly_native";
export type RiskPosture = "raw" | "p90" | "p95";
type Num = number | null;

export interface DashboardParams {
  start_date: string;
  end_date: string;
  selection_mode: SelectionMode;
  cutoff_hour_utc: number;
  min_horizon_hours: number;
  resolution: Resolution;
  demand_mw: number;
  risk_posture: RiskPosture;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  data_source: string;
  fetched_at_utc: string | null;
  actuals_count: number;
  forecasts_raw_count: number;
  forecasts_half_hourly_count: number;
  publish_runs: number;
  actuals_range: (string | null)[];
  forecast_publish_range: (string | null)[];
  delivery_window: string[];
  source_urls: Record<string, string>;
}

export interface DashboardMeta {
  start_date: string;
  end_date: string;
  selection_mode: SelectionMode;
  cutoff_hour_utc: number;
  min_horizon_hours: number;
  resolution: Resolution;
  demand_mw: number;
  risk_posture: RiskPosture;
  period_hours: number;
  settlement_periods: number;
  matched_sample_count: number;
  total_actual_mwh: Num;
  total_forecast_mwh: Num;
  total_risk_adjusted_wind_mwh: Num;
  total_recommended_thermal_mwh: Num;
  total_actual_thermal_needed_mwh: Num;
  total_residual_shortfall_mwh: Num;
  all_pairs_sample_count: number;
  data_source: string;
  data_fetched_at_utc: string | null;
}

export interface Kpis {
  sample_count: number;
  mae_mw: Num;
  rmse_mw: Num;
  mbe_mw: Num;
  mape_pct: Num;
  nmae_pct: Num;
  p05_error_mw: Num;
  p10_error_mw: Num;
  p25_error_mw: Num;
  p50_error_mw: Num;
  p75_error_mw: Num;
  p90_error_mw: Num;
  p95_error_mw: Num;
  p90_shortfall_buffer_mw: Num;
  p95_shortfall_buffer_mw: Num;
  max_overforecast_mw: Num;
  max_overforecast_time: string | null;
  max_underforecast_mw: Num;
  max_underforecast_time: string | null;
  avg_actual_mw: Num;
  peak_actual_mw: Num;
  min_actual_mw: Num;
  avg_forecast_mw: Num;
  avg_lead_time_hours: Num;
  shortfall_period_pct: Num;
  skewness: Num;
  excess_kurtosis: Num;
  std_mw: Num;
}

export interface TimeseriesPoint {
  startTime: string;
  settlementDate: string;
  settlementPeriod: number;
  actual_mw: Num;
  forecast_mw: Num;
  publishTime: string | null;
  horizon_hours: Num;
  is_interpolated: boolean;
  error_mw: Num;
  abs_error_mw: Num;
  p10_bound_mw: Num;
  p90_bound_mw: Num;
  risk_adjusted_wind_mw: Num;
  thermal_procurement_mw: Num;
  actual_thermal_needed_mw: Num;
}

export interface HorizonBucket {
  bucket_label: string;
  min_h: number;
  max_h: number;
  sample_count: number;
  mae_mw: Num;
  rmse_mw: Num;
  mbe_mw: Num;
  mape_pct: Num;
  p90_shortfall_mw: Num;
  p95_shortfall_mw: Num;
}

export interface DiurnalBucket {
  hour_utc: number;
  label: string;
  sample_count: number;
  avg_actual_mw: Num;
  avg_forecast_mw: Num;
  mae_mw: Num;
  mbe_mw: Num;
  p10_error_mw: Num;
  p90_error_mw: Num;
}

export interface HistogramBin {
  bin_start_mw: Num;
  bin_end_mw: Num;
  bin_center_mw: Num;
  count: number;
  percentage: Num;
}

export interface DailySummary {
  date: string;
  decision_date: string;
  settlement_periods: number;
  actual_mwh: Num;
  forecast_mwh: Num;
  risk_adjusted_wind_mwh: Num;
  recommended_thermal_mwh: Num;
  residual_shortfall_mwh: Num;
  mae_mw: Num;
  mbe_mw: Num;
  max_shortfall_mw: Num;
}

export interface CalibrationBucket {
  bucket_label: string;
  q10: Num;
  q90: Num;
  q95: Num;
  n: number;
}

export interface DashboardResponse {
  meta: DashboardMeta;
  kpis: Kpis;
  timeseries: TimeseriesPoint[];
  horizon_accuracy: HorizonBucket[];
  diurnal_profile: DiurnalBucket[];
  error_distribution: HistogramBin[];
  daily_summary: DailySummary[];
  calibration: CalibrationBucket[];
}

export interface Revision {
  publishTime: string;
  horizon_hours: Num;
  forecast_mw: Num;
  error_mw: Num;
  is_interpolated: boolean;
  available_at_day_ahead_cutoff: boolean;
}

export interface ForecastEvolutionResponse {
  target_time: string;
  settlement_period: number;
  actual_mw: Num;
  day_ahead_cutoff: string;
  day_ahead_selected_publish_time: string | null;
  revisions: Revision[];
}
