"""Static configuration: Elexon endpoints, data window and default decision parameters."""
from pathlib import Path

BMRS_BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
FUELHH_STREAM_URL = f"{BMRS_BASE_URL}/datasets/FUELHH/stream"
WINDFOR_STREAM_URL = f"{BMRS_BASE_URL}/datasets/WINDFOR/stream"

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_CACHE_PATH = Path(__file__).resolve().parent / "data" / "jan2026_bmrs_cache.json.gz"
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"

# Actuals cover every delivery day reachable from a January 2026 decision (plus margins).
ACTUALS_START_DATE = "2025-12-31"
ACTUALS_END_DATE = "2026-02-02"

# Forecast publications from 29 Dec 2025 so delivery on 1 Jan has a full 48h+ revision history.
FORECAST_PUBLISH_START = "2025-12-29T00:00:00Z"
FORECAST_PUBLISH_END = "2026-02-02T00:00:00Z"
FORECAST_START_TIME_MIN = "2025-12-31T00:00:00Z"
FORECAST_START_TIME_MAX = "2026-02-02T23:30:00Z"

MAX_HORIZON_HOURS = 72.0
EVAL_MAX_HORIZON_HOURS = 48.0

# Delivery window exposed in the UI: decisions on 31 Dec 2025 .. 31 Jan 2026.
DELIVERY_MIN_DATE = "2026-01-01"
DELIVERY_MAX_DATE = "2026-02-01"

DEFAULT_DEMAND_MW = 25000.0
DEFAULT_CUTOFF_HOUR_UTC = 10
DEFAULT_MIN_HORIZON_HOURS = 24.0

# MAPE denominator floor to avoid blow-ups during wind lulls.
MAPE_FLOOR_MW = 100.0

HORIZON_BUCKETS: list[tuple[str, float, float]] = [
    ("0-4h", 0.0, 4.0),
    ("4-8h", 4.0, 8.0),
    ("8-12h", 8.0, 12.0),
    ("12-18h", 12.0, 18.0),
    ("18-24h", 18.0, 24.0),
    ("24-36h", 24.0, 36.0),
    ("36-48h", 36.0, 48.0),
]

HTTP_TIMEOUT_S = 45.0
HTTP_MAX_RETRIES = 3
HTTP_POLITE_DELAY_S = 0.25
