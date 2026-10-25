"""Elexon BMRS HTTP client for the FUELHH (actuals) and WINDFOR (forecast) streams.

Requests are chunked by date window, retried with exponential backoff on network
errors / HTTP 429 / 5xx, and normalised into plain dicts ready for persistence.
"""
from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable

import httpx

from backend import config

log = logging.getLogger(__name__)

RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def _parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def _iso_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _get_json(client: httpx.Client, url: str, params: dict[str, Any]) -> list[dict]:
    last_exc: Exception | None = None
    for attempt in range(config.HTTP_MAX_RETRIES + 1):
        try:
            resp = client.get(url, params=params)
            if resp.status_code in RETRYABLE_STATUS:
                raise httpx.HTTPStatusError(
                    f"retryable status {resp.status_code}", request=resp.request, response=resp
                )
            resp.raise_for_status()
            payload = resp.json()
            # Stream endpoints return a bare array; non-stream variants wrap in {"data": [...]}.
            if isinstance(payload, dict):
                payload = payload.get("data", [])
            return payload
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            last_exc = exc
            if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code not in RETRYABLE_STATUS:
                raise
            wait = 2**attempt
            log.warning("BMRS request failed (%s); retry %d in %ss", exc, attempt + 1, wait)
            time.sleep(wait)
    raise RuntimeError(f"BMRS request to {url} failed after retries") from last_exc


def _date_chunks(start: date, end: date, days: int) -> Iterable[tuple[date, date]]:
    cur = start
    while cur <= end:
        chunk_end = min(cur + timedelta(days=days - 1), end)
        yield cur, chunk_end
        cur = chunk_end + timedelta(days=1)


def normalise_fuelhh(records: Iterable[dict]) -> list[dict]:
    """Keep WIND rows, coerce types, dedupe by startTime keeping latest publishTime."""
    latest: dict[str, dict] = {}
    for r in records:
        if r.get("fuelType") != "WIND" or r.get("generation") is None or not r.get("startTime"):
            continue
        rec = {
            "startTime": _iso_z(_parse_utc(r["startTime"])),
            "publishTime": _iso_z(_parse_utc(r.get("publishTime") or r["startTime"])),
            "settlementDate": r.get("settlementDate"),
            "settlementPeriod": int(r.get("settlementPeriod") or 0),
            "generation": float(r["generation"]),
        }
        prev = latest.get(rec["startTime"])
        if prev is None or rec["publishTime"] >= prev["publishTime"]:
            latest[rec["startTime"]] = rec
    return [latest[k] for k in sorted(latest)]


def normalise_windfor(
    records: Iterable[dict],
    max_horizon_hours: float = config.MAX_HORIZON_HOURS,
    start_min: str = config.FORECAST_START_TIME_MIN,
    start_max: str = config.FORECAST_START_TIME_MAX,
) -> list[dict]:
    """Filter to 0 <= horizon <= max_horizon and the target window, dedupe by (publishTime, startTime)."""
    lo, hi = _parse_utc(start_min), _parse_utc(start_max)
    out: dict[tuple[str, str], dict] = {}
    for r in records:
        if r.get("generation") is None or not r.get("startTime") or not r.get("publishTime"):
            continue
        st, pt = _parse_utc(r["startTime"]), _parse_utc(r["publishTime"])
        horizon = (st - pt).total_seconds() / 3600.0
        if not (0.0 <= horizon <= max_horizon_hours) or not (lo <= st <= hi):
            continue
        key = (_iso_z(pt), _iso_z(st))
        out[key] = {
            "publishTime": key[0],
            "startTime": key[1],
            "generation": float(r["generation"]),
            "horizon_hours": round(horizon, 4),
        }
    return [out[k] for k in sorted(out)]


def fetch_fuelhh_wind(
    start_date: str = config.ACTUALS_START_DATE,
    end_date: str = config.ACTUALS_END_DATE,
    client: httpx.Client | None = None,
) -> list[dict]:
    own = client is None
    client = client or httpx.Client(timeout=config.HTTP_TIMEOUT_S)
    raw: list[dict] = []
    try:
        for a, b in _date_chunks(date.fromisoformat(start_date), date.fromisoformat(end_date), 7):
            params = {"settlementDateFrom": a.isoformat(), "settlementDateTo": b.isoformat(), "fuelType": "WIND"}
            raw.extend(_get_json(client, config.FUELHH_STREAM_URL, params))
            time.sleep(config.HTTP_POLITE_DELAY_S)
    finally:
        if own:
            client.close()
    return normalise_fuelhh(raw)


def fetch_windfor(
    publish_from: str = config.FORECAST_PUBLISH_START,
    publish_to: str = config.FORECAST_PUBLISH_END,
    client: httpx.Client | None = None,
) -> list[dict]:
    own = client is None
    client = client or httpx.Client(timeout=config.HTTP_TIMEOUT_S)
    raw: list[dict] = []
    try:
        cur, end = _parse_utc(publish_from), _parse_utc(publish_to)
        while cur < end:
            nxt = min(cur + timedelta(days=5), end)
            params = {"publishDateTimeFrom": _iso_z(cur), "publishDateTimeTo": _iso_z(nxt)}
            raw.extend(_get_json(client, config.WINDFOR_STREAM_URL, params))
            cur = nxt
            time.sleep(config.HTTP_POLITE_DELAY_S)
    finally:
        if own:
            client.close()
    return normalise_windfor(raw)
