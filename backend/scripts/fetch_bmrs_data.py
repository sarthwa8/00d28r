"""Fetch, validate and cache the January 2026 BMRS wind dataset.

Usage: python -m backend.scripts.fetch_bmrs_data
"""
from __future__ import annotations

import logging
import sys
from collections import Counter

from backend import bmrs_client, config
from backend.data_store import build_snapshot, write_snapshot

MIN_ACTUALS = 1500
MIN_FORECASTS = 10000


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    print(f"Fetching FUELHH WIND actuals {config.ACTUALS_START_DATE} .. {config.ACTUALS_END_DATE}")
    actuals = bmrs_client.fetch_fuelhh_wind()
    print(f"Fetching WINDFOR forecasts published {config.FORECAST_PUBLISH_START} .. {config.FORECAST_PUBLISH_END}")
    forecasts = bmrs_client.fetch_windfor()

    per_day = Counter(a["startTime"][:10] for a in actuals)
    jan_days = [f"2026-01-{d:02d}" for d in range(1, 32)] + ["2026-02-01"]
    incomplete = {d: per_day.get(d, 0) for d in jan_days if per_day.get(d, 0) < 48}
    publish_runs = sorted({f["publishTime"] for f in forecasts})

    print(f"  actuals rows:      {len(actuals)}  ({actuals[0]['startTime']} -> {actuals[-1]['startTime']})")
    print(f"  forecast rows:     {len(forecasts)}  ({len(publish_runs)} publish runs, "
          f"{publish_runs[0]} -> {publish_runs[-1]})")
    print(f"  delivery days 2026-01-01..2026-02-01 with <48 SPs: {incomplete or 'none'}")
    gens = [a["generation"] for a in actuals]
    print(f"  actual wind MW: min={min(gens):.0f} max={max(gens):.0f} mean={sum(gens)/len(gens):.0f}")

    if len(actuals) < MIN_ACTUALS or len(forecasts) < MIN_FORECASTS:
        print("ERROR: dataset smaller than expected; snapshot not written", file=sys.stderr)
        return 1
    if any(g < 0 for g in gens):
        print("ERROR: negative wind generation found", file=sys.stderr)
        return 1

    write_snapshot(build_snapshot(actuals, forecasts))
    print(f"Wrote {config.DATA_CACHE_PATH} ({config.DATA_CACHE_PATH.stat().st_size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
