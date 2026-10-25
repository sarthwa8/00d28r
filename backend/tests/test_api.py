import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["actuals_count"] >= 1500 and body["publish_runs"] > 200


@pytest.mark.parametrize(
    "params,expected_points",
    [
        ({}, 31 * 48),
        ({"selection_mode": "horizon_hours", "min_horizon_hours": 12}, 31 * 48),
        ({"start_date": "2026-01-15", "end_date": "2026-01-15"}, 48),
        ({"resolution": "hourly_native"}, 31 * 24),
        ({"start_date": "2026-01-02", "end_date": "2026-02-01", "risk_posture": "bias"}, 31 * 48),
        ({"start_date": "2026-02-01", "end_date": "2026-02-01", "risk_posture": "p95", "demand_mw": 30000}, 48),
    ],
)
def test_dashboard_variants(client, params, expected_points):
    r = client.get("/api/v1/dashboard", params=params)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["timeseries"]) == expected_points
    assert len(body["horizon_accuracy"]) == 7 and any(b["sample_count"] for b in body["horizon_accuracy"])
    assert len(body["diurnal_profile"]) == 24
    assert body["kpis"]["mae_mw"] > 0 and body["kpis"]["rmse_mw"] >= body["kpis"]["mae_mw"]
    assert len(body["error_distribution"]) == 20


def test_forecast_evolution(client):
    r = client.get("/api/v1/forecast-evolution", params={"target_time": "2026-01-15T18:00:00Z"})
    assert r.status_code == 200
    body = r.json()
    pubs = [x["publishTime"] for x in body["revisions"]]
    assert pubs == sorted(pubs) and len(pubs) >= 8
    assert body["actual_mw"] is not None
    assert body["day_ahead_selected_publish_time"] == "2026-01-14T09:30:00Z"


@pytest.mark.parametrize(
    "params",
    [
        {"start_date": "not-a-date"},
        {"start_date": "2025-11-01"},
        {"start_date": "2026-01-20", "end_date": "2026-01-10"},
    ],
)
def test_dashboard_bad_dates(client, params):
    r = client.get("/api/v1/dashboard", params=params)
    assert r.status_code == 400
    assert "detail" in r.json()


def test_dashboard_bad_enum_is_422(client):
    assert client.get("/api/v1/dashboard", params={"risk_posture": "p99"}).status_code == 422


def test_evolution_bad_time(client):
    assert client.get("/api/v1/forecast-evolution", params={"target_time": "garbage"}).status_code == 400
    assert client.get("/api/v1/forecast-evolution", params={"target_time": "2026-01-15T18:10:00Z"}).status_code == 400


def test_unknown_api_path_is_json_404(client):
    r = client.get("/api/v1/nope")
    assert r.status_code == 404 and r.json()["detail"]


def test_spa_cache_headers(client):
    from backend import config

    if not (config.FRONTEND_DIST / "index.html").exists():
        pytest.skip("frontend not built")
    assert client.get("/").headers["cache-control"] == "no-cache"
    asset = next((config.FRONTEND_DIST / "assets").glob("*.js")).name
    assert "immutable" in client.get(f"/assets/{asset}").headers["cache-control"]
