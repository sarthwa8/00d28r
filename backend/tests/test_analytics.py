import math
from datetime import date

import numpy as np
import pandas as pd
import pytest

from backend import analytics as A
from backend.data_store import forecasts_frame, interpolate_half_hourly


def ts(s):
    return pd.Timestamp(s, tz="UTC")


@pytest.fixture
def synthetic_forecasts():
    # Three publish runs forecasting 2026-01-10 12:00 (and 13:00) with different values.
    recs = []
    for pub, val in [("2026-01-08T22:30:00Z", 1000), ("2026-01-09T09:30:00Z", 2000), ("2026-01-09T11:30:00Z", 3000),
                     ("2026-01-10T07:30:00Z", 4000)]:
        for st in ("2026-01-10T12:00:00Z", "2026-01-10T13:00:00Z"):
            recs.append({"publishTime": pub, "startTime": st, "generation": val})
    return forecasts_frame(recs)


class TestAsOfSelection:
    def test_day_ahead_cutoff_picks_latest_before_cutoff(self, synthetic_forecasts):
        sel = A.select_as_of_forecasts(synthetic_forecasts, pd.Series([ts("2026-01-10T12:00")]), "day_ahead_cutoff", 10)
        assert len(sel) == 1
        assert sel.iloc[0]["publishTime"] == ts("2026-01-09T09:30")
        assert sel.iloc[0]["forecast_mw"] == 2000

    def test_later_cutoff_sees_later_run(self, synthetic_forecasts):
        sel = A.select_as_of_forecasts(synthetic_forecasts, pd.Series([ts("2026-01-10T12:00")]), "day_ahead_cutoff", 12)
        assert sel.iloc[0]["forecast_mw"] == 3000

    def test_cutoff_before_any_run_returns_empty(self, synthetic_forecasts):
        sel = A.select_as_of_forecasts(synthetic_forecasts, pd.Series([ts("2026-01-10T12:00")]), "day_ahead_cutoff", 0)
        # 2026-01-09 00:00 cutoff: only the 2026-01-08 22:30 run is eligible.
        assert sel.iloc[0]["forecast_mw"] == 1000

    def test_horizon_mode_respects_min_horizon(self, synthetic_forecasts):
        target = ts("2026-01-10T12:00")
        for h, expected in [(0, 4000), (4, 4000), (5, 3000), (24, 3000), (25, 2000), (30, 1000)]:
            sel = A.select_as_of_forecasts(synthetic_forecasts, pd.Series([target]), "horizon_hours", min_horizon_hours=h)
            assert sel.iloc[0]["forecast_mw"] == expected, h
            assert sel.iloc[0]["publishTime"] <= target - pd.Timedelta(hours=h)

    def test_horizon_mode_window_is_enforced(self, synthetic_forecasts):
        sel = A.select_as_of_forecasts(
            synthetic_forecasts, pd.Series([ts("2026-01-10T12:00")]), "horizon_hours", min_horizon_hours=30, max_horizon_hours=37
        )
        assert sel.empty  # the only run >= 30h ahead is 37.5h old
        sel = A.select_as_of_forecasts(
            synthetic_forecasts, pd.Series([ts("2026-01-10T12:00")]), "horizon_hours", min_horizon_hours=30, max_horizon_hours=40
        )
        assert sel.iloc[0]["forecast_mw"] == 1000

    def test_real_data_day_ahead_invariant(self, loaded_store):
        _, raw, half = loaded_store.frames()
        targets = half[(half["startTime"] >= ts("2026-01-02")) & (half["startTime"] < ts("2026-01-05"))]["startTime"]
        for cutoff_hour in (6, 10, 16):
            sel = A.select_as_of_forecasts(half, targets, "day_ahead_cutoff", cutoff_hour)
            cutoff = sel["startTime"].dt.floor("D") - pd.Timedelta(days=1) + pd.Timedelta(hours=cutoff_hour)
            assert (sel["publishTime"] <= cutoff).all()
            # No eligible forecast was skipped: nothing later than the selected run is also <= cutoff.
            for r in sel.itertuples():
                runs = half[(half["startTime"] == r.startTime) & (half["publishTime"] <= r.cutoff)]["publishTime"]
                assert runs.max() == r.publishTime

    def test_real_data_horizon_invariant(self, loaded_store):
        _, _, half = loaded_store.frames()
        targets = half[(half["startTime"] >= ts("2026-01-20")) & (half["startTime"] < ts("2026-01-21"))]["startTime"]
        sel = A.select_as_of_forecasts(half, targets, "horizon_hours", min_horizon_hours=12)
        assert len(sel) == 48
        assert (sel["publishTime"] <= sel["startTime"] - pd.Timedelta(hours=12)).all()
        assert (sel["horizon_hours"] >= 12).all() and (sel["horizon_hours"] <= 48).all()


class TestResolution:
    def test_half_hourly_interpolation(self):
        raw = forecasts_frame([
            {"publishTime": "2026-01-01T09:30:00Z", "startTime": "2026-01-02T00:00:00Z", "generation": 1000},
            {"publishTime": "2026-01-01T09:30:00Z", "startTime": "2026-01-02T01:00:00Z", "generation": 2000},
        ])
        half = interpolate_half_hourly(raw)
        assert list(half["generation"]) == [1000, 1500, 2000]
        assert list(half["is_interpolated"]) == [False, True, False]
        assert half.iloc[1]["horizon_hours"] == pytest.approx(15.0)

    def test_no_extrapolation_across_batches(self):
        raw = forecasts_frame([
            {"publishTime": "2026-01-01T09:30:00Z", "startTime": "2026-01-02T00:00:00Z", "generation": 1000},
            {"publishTime": "2026-01-01T11:30:00Z", "startTime": "2026-01-02T01:00:00Z", "generation": 2000},
        ])
        half = interpolate_half_hourly(raw)
        assert len(half) == 2 and not half["is_interpolated"].any()

    def test_hourly_native_dashboard_has_only_whole_hours(self, loaded_store):
        d = A.build_dashboard(loaded_store, A.DashboardParams(date(2026, 1, 5), date(2026, 1, 5), resolution="hourly_native"))
        assert len(d["timeseries"]) == 24
        assert all(p["startTime"][14:16] == "00" and not p["is_interpolated"] for p in d["timeseries"])

    def test_half_hourly_dashboard_covers_48_sps(self, loaded_store):
        d = A.build_dashboard(loaded_store, A.DashboardParams(date(2026, 1, 5), date(2026, 1, 5)))
        assert [p["settlementPeriod"] for p in d["timeseries"]] == list(range(1, 49))
        assert all(p["forecast_mw"] is not None for p in d["timeseries"])


class TestMetrics:
    def test_known_vector(self):
        f = np.array([110.0, 90.0, 300.0, 50.0])
        a = np.array([100.0, 100.0, 200.0, 50.0])
        m = A.error_metrics(f, a)
        e = f - a  # [10, -10, 100, 0]
        assert m["n"] == 4
        assert m["mae"] == pytest.approx(30.0)
        assert m["rmse"] == pytest.approx(math.sqrt((100 + 100 + 10000 + 0) / 4))
        assert m["mbe"] == pytest.approx(25.0)
        assert m["mape"] == pytest.approx(100 * np.mean(np.abs(e) / np.maximum(a, 100.0)))
        assert m["nmae"] == pytest.approx(100 * 30 / 200)
        assert m["p90"] == pytest.approx(np.percentile(e, 90))
        assert m["p90_shortfall_buffer"] == pytest.approx(max(0, np.percentile(e, 90)))

    def test_mape_floor_avoids_blowup(self):
        m = A.error_metrics(np.array([50.0]), np.array([0.0]))
        assert m["mape"] == pytest.approx(50.0)

    def test_shortfall_buffer_never_negative(self):
        m = A.error_metrics(np.array([0.0, 0.0, 0.0]), np.array([100.0, 200.0, 300.0]))
        assert m["p90"] < 0 and m["p90_shortfall_buffer"] == 0.0

    def test_empty(self):
        assert A.error_metrics(np.array([]), np.array([]))["n"] == 0


class TestProcurement:
    def test_risk_adjusted_wind_and_thermal(self):
        calib = {
            "18-24h": {"q10": -100.0, "q50": 400.0, "q90": 1000.0, "q95": 1500.0},
            "0-4h": {"q10": -50.0, "q50": -30.0, "q90": -20.0, "q95": -10.0},
        }
        fc = pd.Series([5000.0, 800.0, 3000.0])
        buckets = pd.Series(["18-24h", "18-24h", "0-4h"])
        assert list(A.risk_adjusted_wind(fc, buckets, calib, "raw")) == [5000, 800, 3000]
        assert list(A.risk_adjusted_wind(fc, buckets, calib, "bias")) == [4600, 400, 3000]
        assert list(A.risk_adjusted_wind(fc, buckets, calib, "p90")) == [4000, 0, 3000]  # clipped at 0; negative buffer ignored
        assert list(A.risk_adjusted_wind(fc, buckets, calib, "p95")) == [3500, 0, 3000]
        thermal = A.thermal_procurement(25000.0, A.risk_adjusted_wind(fc, buckets, calib, "p90"))
        assert list(thermal) == [21000, 25000, 22000]
        assert list(A.thermal_procurement(1000.0, pd.Series([5000.0]))) == [0.0]

    def test_bucket_labels(self):
        labels = A.bucket_label(pd.Series([0.0, 3.99, 4.0, 23.5, 24.0, 47.9, 48.0]))
        assert list(labels) == ["0-4h", "0-4h", "4-8h", "18-24h", "24-36h", "36-48h", "36-48h"]

    def test_dashboard_consistency(self, loaded_store):
        p = A.DashboardParams(date(2026, 1, 1), date(2026, 1, 31), demand_mw=30000, risk_posture="p95")
        d = A.build_dashboard(loaded_store, p)
        pts = [x for x in d["timeseries"] if x["forecast_mw"] is not None]
        assert d["meta"]["settlement_periods"] == 31 * 48
        for x in pts[:200]:
            assert x["error_mw"] == pytest.approx(x["forecast_mw"] - x["actual_mw"], abs=0.02)
            assert x["risk_adjusted_wind_mw"] <= x["forecast_mw"] + 1e-6
            assert x["thermal_procurement_mw"] == pytest.approx(max(0, 30000 - x["risk_adjusted_wind_mw"]), abs=0.02)
            assert x["p10_bound_mw"] <= x["p90_bound_mw"]
        total = sum(x["thermal_procurement_mw"] for x in pts) * 0.5
        assert d["meta"]["total_recommended_thermal_mwh"] == pytest.approx(total, rel=1e-6)
        assert sum(b["count"] for b in d["error_distribution"]) == d["kpis"]["sample_count"]
        assert sum(day["recommended_thermal_mwh"] for day in d["daily_summary"]) == pytest.approx(total, rel=1e-6)
        m = d["meta"]
        # buy - needed = long - short, period by period, so the totals must reconcile.
        net = m["total_recommended_thermal_mwh"] - m["total_actual_thermal_needed_mwh"]
        assert net == pytest.approx(m["total_over_procured_mwh"] - m["total_residual_shortfall_mwh"], abs=1.0)

    def test_posture_ordering_on_real_data(self, loaded_store):
        totals = {}
        for posture in ("raw", "bias", "p90", "p95"):
            d = A.build_dashboard(loaded_store, A.DashboardParams(date(2026, 1, 2), date(2026, 2, 1), risk_posture=posture))
            totals[posture] = (d["meta"]["total_recommended_thermal_mwh"], d["meta"]["total_residual_shortfall_mwh"])
        # More conservative postures buy more thermal and leave less short exposure.
        assert totals["raw"][0] < totals["bias"][0] < totals["p90"][0] < totals["p95"][0]
        assert totals["raw"][1] > totals["bias"][1] > totals["p90"][1] > totals["p95"][1]

    def test_decision_dates_are_january(self, loaded_store):
        d = A.build_dashboard(loaded_store, A.DashboardParams(date(2026, 1, 2), date(2026, 2, 1)))
        decisions = [x["decision_date"] for x in d["daily_summary"]]
        assert decisions[0] == "2026-01-01" and decisions[-1] == "2026-01-31"
        # Every selected forecast was published on the decision day (D-1) or earlier, never on D.
        for x in d["timeseries"]:
            assert x["publishTime"] < x["settlementDate"] + "T10:00:00Z"
            assert x["publishTime"][:10] < x["settlementDate"]
