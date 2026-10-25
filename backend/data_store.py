"""Thread-safe in-memory data manager backed by a gzip JSON snapshot of BMRS data.

On startup the snapshot is parsed into three DataFrames:
  * actuals_df               - FUELHH WIND outturn, 30-min resolution
  * forecasts_raw_df         - WINDFOR as published (hourly), 0..72h horizon
  * forecasts_half_hourly_df - WINDFOR with :30 points linearly interpolated per publish batch
"""
from __future__ import annotations

import gzip
import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from backend import bmrs_client, config

log = logging.getLogger(__name__)


def build_snapshot(actuals: list[dict], forecasts: list[dict]) -> dict:
    return {
        "metadata": {
            "fetched_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source_urls": {"actuals": config.FUELHH_STREAM_URL, "forecasts": config.WINDFOR_STREAM_URL},
            "actuals_window": [config.ACTUALS_START_DATE, config.ACTUALS_END_DATE],
            "forecast_publish_window": [config.FORECAST_PUBLISH_START, config.FORECAST_PUBLISH_END],
            "max_horizon_hours": config.MAX_HORIZON_HOURS,
            "actuals_count": len(actuals),
            "forecasts_count": len(forecasts),
        },
        "actuals": actuals,
        "forecasts": forecasts,
    }


def write_snapshot(snapshot: dict, path: Path = config.DATA_CACHE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # mtime=0 keeps the gzip byte-identical for identical content (deterministic snapshot).
    with open(path, "wb") as fh, gzip.GzipFile(fileobj=fh, mode="wb", mtime=0) as gz:
        gz.write(json.dumps(snapshot, separators=(",", ":")).encode("utf-8"))


def read_snapshot(path: Path = config.DATA_CACHE_PATH) -> dict:
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def actuals_frame(records: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame.from_records(records)
    if df.empty:
        return pd.DataFrame(columns=["startTime", "publishTime", "settlementDate", "settlementPeriod", "generation"])
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True).dt.floor("min")
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True).dt.floor("min")
    df = df[df["generation"].notna()]
    df = df.sort_values(["startTime", "publishTime"]).drop_duplicates("startTime", keep="last")
    return df.reset_index(drop=True)


def forecasts_frame(records: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame.from_records(records)
    if df.empty:
        return pd.DataFrame(columns=["publishTime", "startTime", "generation", "horizon_hours", "is_interpolated"])
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True).dt.floor("min")
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True).dt.floor("min")
    df = df.sort_values(["publishTime", "startTime"]).drop_duplicates(["publishTime", "startTime"], keep="last")
    df["horizon_hours"] = (df["startTime"] - df["publishTime"]).dt.total_seconds() / 3600.0
    df["is_interpolated"] = False
    return df[["publishTime", "startTime", "generation", "horizon_hours", "is_interpolated"]].reset_index(drop=True)


def interpolate_half_hourly(raw: pd.DataFrame) -> pd.DataFrame:
    """Per publish batch, reindex onto a 30-min grid and linearly interpolate the gaps.

    Only interior gaps are filled (no extrapolation beyond a batch's first/last point).
    """
    if raw.empty:
        return raw.copy()
    parts = []
    for pub, grp in raw.groupby("publishTime", sort=True):
        s = grp.set_index("startTime")["generation"]
        grid = pd.date_range(s.index.min(), s.index.max(), freq="30min", tz="UTC")
        native = grid.isin(s.index)
        filled = s.reindex(grid).interpolate(method="time", limit_area="inside")
        parts.append(
            pd.DataFrame(
                {"publishTime": pub, "startTime": grid, "generation": filled.to_numpy(), "is_interpolated": ~native}
            )
        )
    out = pd.concat(parts, ignore_index=True).dropna(subset=["generation"])
    out["horizon_hours"] = (out["startTime"] - out["publishTime"]).dt.total_seconds() / 3600.0
    out = out[out["horizon_hours"] >= 0]
    return out[["publishTime", "startTime", "generation", "horizon_hours", "is_interpolated"]].reset_index(drop=True)


class DataStore:
    def __init__(self, path: Path = config.DATA_CACHE_PATH):
        self.path = path
        self._lock = threading.RLock()
        self.metadata: dict = {}
        self.source = "uninitialised"
        self.actuals_df = actuals_frame([])
        self.forecasts_raw_df = forecasts_frame([])
        self.forecasts_half_hourly_df = forecasts_frame([])
        self.version = 0

    def _install(self, snapshot: dict, source: str) -> None:
        actuals = actuals_frame(snapshot.get("actuals", []))
        raw = forecasts_frame(snapshot.get("forecasts", []))
        half = interpolate_half_hourly(raw)
        with self._lock:
            self.metadata = snapshot.get("metadata", {})
            self.actuals_df, self.forecasts_raw_df, self.forecasts_half_hourly_df = actuals, raw, half
            self.source = source
            self.version += 1

    def load(self) -> None:
        if self.path.exists():
            self._install(read_snapshot(self.path), "snapshot")
            log.info("Loaded BMRS snapshot: %s", self.metadata)
        else:
            log.warning("Snapshot %s missing; fetching live from Elexon", self.path)
            self.refresh_from_live_api()

    def refresh_from_live_api(self) -> dict:
        actuals = bmrs_client.fetch_fuelhh_wind()
        forecasts = bmrs_client.fetch_windfor()
        if not actuals or not forecasts:
            raise RuntimeError("Elexon returned an empty dataset; keeping existing data")
        snapshot = build_snapshot(actuals, forecasts)
        try:
            write_snapshot(snapshot, self.path)
        except OSError as exc:  # read-only filesystems (e.g. serverless) keep the refresh in memory
            log.warning("Could not persist refreshed snapshot: %s", exc)
        self._install(snapshot, "live_refresh")
        return self.metadata

    def frames(self) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        with self._lock:
            return self.actuals_df, self.forecasts_raw_df, self.forecasts_half_hourly_df


store = DataStore()
