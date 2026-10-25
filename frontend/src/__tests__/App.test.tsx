import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";
import { toCsv } from "../components/ProcurementDeskTab";
import { fmtSigned, fmtTime } from "../lib/format";
import type { DashboardResponse, HealthResponse, TimeseriesPoint } from "../types/api";

const point = (i: number): TimeseriesPoint => ({
  startTime: `2026-01-05T${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}:00Z`,
  settlementDate: "2026-01-05",
  settlementPeriod: i + 1,
  actual_mw: 10000,
  forecast_mw: 12000,
  publishTime: "2026-01-04T09:30:00Z",
  horizon_hours: 14.5 + i * 0.5,
  is_interpolated: i % 2 === 1,
  error_mw: 2000,
  abs_error_mw: 2000,
  p10_bound_mw: 8000,
  p90_bound_mw: 12500,
  risk_adjusted_wind_mw: 8000,
  thermal_procurement_mw: 17000,
  actual_thermal_needed_mw: 15000,
});

const kpis = {
  sample_count: 48, mae_mw: 2107.75, rmse_mw: 2610.5, mbe_mw: 1838.9, mape_pct: 21.9, nmae_pct: 11.8,
  p05_error_mw: -500, p10_error_mw: -200, p25_error_mw: 800, p50_error_mw: 1800, p75_error_mw: 2900,
  p90_error_mw: 4333.7, p95_error_mw: 5394.8, p90_shortfall_buffer_mw: 4333.7, p95_shortfall_buffer_mw: 5394.8,
  max_overforecast_mw: 8000, max_overforecast_time: "2026-01-05T18:00:00Z", max_underforecast_mw: 1500,
  max_underforecast_time: "2026-01-05T03:00:00Z", avg_actual_mw: 10000, peak_actual_mw: 17805, min_actual_mw: 1695,
  avg_forecast_mw: 12000, avg_lead_time_hours: 26.2, shortfall_period_pct: 86, skewness: 0.1, excess_kurtosis: -0.2, std_mw: 1500,
};

const dashboard: DashboardResponse = {
  meta: {
    start_date: "2026-01-01", end_date: "2026-01-31", selection_mode: "day_ahead_cutoff", cutoff_hour_utc: 10,
    min_horizon_hours: 24, resolution: "half_hourly", demand_mw: 25000, risk_posture: "p90", period_hours: 0.5,
    settlement_periods: 48, matched_sample_count: 48, total_actual_mwh: 240000, total_forecast_mwh: 288000,
    total_risk_adjusted_wind_mwh: 192000, total_recommended_thermal_mwh: 408000, total_actual_thermal_needed_mwh: 360000,
    total_residual_shortfall_mwh: 1000, total_over_procured_mwh: 49000, all_pairs_sample_count: 700, data_source: "snapshot", data_fetched_at_utc: "2026-10-25T00:00:00Z",
  },
  kpis,
  timeseries: Array.from({ length: 48 }, (_, i) => point(i)),
  horizon_accuracy: [
    { bucket_label: "0-4h", min_h: 0, max_h: 4, sample_count: 100, mae_mw: 1767, rmse_mw: 2245, mbe_mw: 1546, mape_pct: 16, p90_shortfall_mw: 3706, p95_shortfall_mw: 4470 },
    { bucket_label: "36-48h", min_h: 36, max_h: 48, sample_count: 100, mae_mw: 2336, rmse_mw: 2865, mbe_mw: 2001, mape_pct: 25, p90_shortfall_mw: 4570, p95_shortfall_mw: 5598 },
  ],
  diurnal_profile: Array.from({ length: 24 }, (_, h) => ({
    hour_utc: h, label: `${String(h).padStart(2, "0")}:00`, sample_count: 2, avg_actual_mw: 10000, avg_forecast_mw: 12000,
    mae_mw: 2000 + h, mbe_mw: 1800, p10_error_mw: -200, p90_error_mw: 4000,
  })),
  error_distribution: [{ bin_start_mw: -1000, bin_end_mw: 0, bin_center_mw: -500, count: 10, percentage: 20.8 }, { bin_start_mw: 0, bin_end_mw: 1000, bin_center_mw: 500, count: 38, percentage: 79.2 }],
  daily_summary: [{ date: "2026-01-05", decision_date: "2026-01-04", settlement_periods: 48, actual_mwh: 240000, forecast_mwh: 288000, risk_adjusted_wind_mwh: 192000, recommended_thermal_mwh: 408000, residual_shortfall_mwh: 1000, mae_mw: 2000, mbe_mw: 2000, max_shortfall_mw: 2000 }],
  calibration: [{ bucket_label: "24-36h", q10: -481.85, q50: 1500, q90: 4235.5, q95: 5159, n: 6144 }],
};

const health: HealthResponse = {
  status: "ok", data_source: "snapshot", fetched_at_utc: "2026-10-25T00:00:00Z", actuals_count: 1632, forecasts_raw_count: 15679,
  forecasts_half_hourly_count: 31078, publish_runs: 280, actuals_range: ["2025-12-31T00:00:00Z", "2026-02-02T23:30:00Z"],
  forecast_publish_range: ["2025-12-29T02:30:00Z", "2026-02-01T22:30:00Z"], delivery_window: ["2026-01-01", "2026-02-01"],
  source_urls: { actuals: "x", forecasts: "y" },
};

const evolution = {
  target_time: "2026-01-05T18:00:00Z", settlement_period: 37, actual_mw: 10000, day_ahead_cutoff: "2026-01-04T10:00:00Z",
  day_ahead_selected_publish_time: "2026-01-04T09:30:00Z",
  revisions: [
    { publishTime: "2026-01-04T09:30:00Z", horizon_hours: 32.5, forecast_mw: 12000, error_mw: 2000, is_interpolated: false, available_at_day_ahead_cutoff: true },
    { publishTime: "2026-01-05T15:30:00Z", horizon_hours: 2.5, forecast_mw: 10500, error_mw: 500, is_interpolated: false, available_at_day_ahead_cutoff: false },
  ],
};

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/health")) return json(health);
      if (url.includes("/forecast-evolution")) return json(evolution);
      return json(dashboard);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WindSight GB app", () => {
  it("renders header, status badge and the four workspaces", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /WindSight/ })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Procurement desk", "Error lab", "Client briefing", "Tech review"]);
    await waitFor(() => expect(screen.getByTestId("status-badge")).toHaveTextContent("Elexon BMRS verified, 280 forecast runs"));
  });

  it("renders KPI values from the dashboard API", async () => {
    render(<App />);
    const strip = await screen.findByTestId("kpi-strip");
    expect(strip).toHaveTextContent("2,108");
    expect(strip).toHaveTextContent("+1,839");
    expect(strip).toHaveTextContent("4,334");
    expect(screen.getByText(/Bid schedule for/)).toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBeGreaterThan(48);
  });

  it("passes control changes to the API", async () => {
    render(<App />);
    await screen.findByTestId("kpi-strip");
    fireEvent.click(screen.getByRole("button", { name: "P95" }));
    await waitFor(() => expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some(([u]) => String(u).includes("risk_posture=p95"))).toBe(true));
  });

  it("opens the forecast evolution modal from the schedule", async () => {
    render(<App />);
    await screen.findByTestId("kpi-strip");
    fireEvent.click(screen.getAllByRole("button", { name: /Revisions/ })[0]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText(/no — published after cutoff/)).toBeInTheDocument();
  });

  it("switches to the error lab and both presentation tabs", async () => {
    render(<App />);
    await screen.findByTestId("kpi-strip");
    fireEvent.click(screen.getByRole("tab", { name: "Error lab" }));
    expect(await screen.findByText(/The further ahead, the bigger the miss/)).toBeInTheDocument();
    expect(screen.getByLabelText("Error quantiles")).toHaveTextContent("+4,334");
    fireEvent.click(screen.getByRole("tab", { name: "Client briefing" }));
    expect(await screen.findByText(/promised an average of 1,839 MW more than the turbines delivered/)).toBeInTheDocument();
    expect(screen.getByLabelText("Posture trade-off")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Tech review" }));
    expect(await screen.findByText(/No look-ahead/)).toBeInTheDocument();
    expect(await screen.findByText(/2 \/ 2|1 \/ 2/)).toBeInTheDocument();
  });
});

describe("helpers", () => {
  it("formats signed MW and UTC times", () => {
    expect(fmtSigned(1838.9)).toBe("+1,839");
    expect(fmtSigned(-12)).toBe("-12");
    expect(fmtTime("2026-01-15T18:30:00Z")).toBe("15 Jan 18:30");
  });
  it("exports the schedule as CSV", () => {
    const csv = toCsv([point(0)]).split("\n");
    expect(csv[0].split(",")).toContain("thermal_procurement_mw");
    expect(csv[1]).toContain("2026-01-05T00:00:00Z");
  });
});
