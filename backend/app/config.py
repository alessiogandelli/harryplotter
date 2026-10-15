"""Runtime configuration, read from the environment on each access.

Reading dynamically (rather than caching at import time) lets tests point the
service at a temporary data directory and switch providers without reloading.
"""

from __future__ import annotations

import os
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent

VALID_PROVIDER_MODES = {"auto", "fake", "decisions", "structured"}


def data_dir() -> Path:
    return Path(os.environ.get("FIGURELAB_DATA_DIR", str(BACKEND_ROOT / "data")))


def datasets_dir() -> Path:
    return data_dir() / "datasets"


def db_path() -> Path:
    return Path(os.environ.get("FIGURELAB_DB_PATH", str(data_dir() / "figurelab.sqlite")))


def openai_api_key() -> str | None:
    key = os.environ.get("OPENAI_API_KEY")
    return key if key else None


def openai_base_url() -> str:
    return os.environ.get("OPENAI_BASE_URL", "https://api.openai.com").rstrip("/")


def provider_mode() -> str:
    mode = (os.environ.get("FIGURELAB_PROVIDER") or "auto").strip().lower()
    return mode if mode in VALID_PROVIDER_MODES else "auto"


def confidence_threshold() -> float:
    try:
        return float(os.environ.get("FIGURELAB_CONFIDENCE_THRESHOLD", "0.5"))
    except (TypeError, ValueError):
        return 0.5


def ensure_dirs() -> None:
    data_dir().mkdir(parents=True, exist_ok=True)
    datasets_dir().mkdir(parents=True, exist_ok=True)
