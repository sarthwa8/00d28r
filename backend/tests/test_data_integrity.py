from collections import Counter
from datetime import datetime

from backend import config
from backend.data_store import read_snapshot


def test_snapshot_exists_and_loads():
    assert config.DATA_CACHE_PATH.exists() and config.DATA_CACHE_PATH.stat().st_size > 10_000
    snap = read_snapshot()
    assert snap["metadata"]["actuals_count"] == len(snap["actuals"])
    assert snap["metadata"]["forecasts_count"] == len(snap["forecasts"])


def test_actuals_cover_every_delivery_day():
    snap = read_snapshot()
    per_day = Counter(a["startTime"][:10] for a in snap["actuals"])
    days = [f"2026-01-{d:02d}" for d in range(1, 32)] + ["2026-02-01"]
    assert all(per_day[d] == 48 for d in days), {d: per_day[d] for d in days if per_day[d] != 48}
    assert len(snap["actuals"]) >= 1500
    assert all(a["generation"] >= 0 for a in snap["actuals"])
    assert len({a["startTime"] for a in snap["actuals"]}) == len(snap["actuals"])


def test_forecasts_published_in_window_with_valid_horizons():
    snap = read_snapshot()
    f = snap["forecasts"]
    assert len(f) >= 10000
    assert any(r["publishTime"].startswith("2026-01") for r in f)
    for r in f:
        st = datetime.fromisoformat(r["startTime"].replace("Z", "+00:00"))
        pt = datetime.fromisoformat(r["publishTime"].replace("Z", "+00:00"))
        h = (st - pt).total_seconds() / 3600
        assert 0 <= h <= 72 and abs(h - r["horizon_hours"]) < 1e-3
        assert r["generation"] >= 0
    assert len({(r["publishTime"], r["startTime"]) for r in f}) == len(f)


def test_every_january_decision_has_a_day_ahead_forecast():
    snap = read_snapshot()
    pubs_by_day = Counter(r["publishTime"][:10] for r in snap["forecasts"])
    for d in range(1, 32):
        assert pubs_by_day[f"2026-01-{d:02d}"] > 0
