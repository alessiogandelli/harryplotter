"""Runtime configuration, read from the environment on each access.

Values are read dynamically (rather than cached at import time) so tests can
point the service at a temporary data directory and switch providers without
reloading. Secrets such as ``OPENAI_API_KEY`` may be supplied either as real
environment variables or in a ``.env`` file; the real environment always wins.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parent.parent

# Looked up in order; the first file to define a variable wins, and any variable
# already present in the real environment is never overwritten.
ENV_FILES = [BACKEND_ROOT / ".env", BACKEND_ROOT.parent / ".env"]

VALID_PROVIDER_MODES = {"auto", "fake", "decisions", "structured"}


def load_env_files(paths: list[Path] | None = None) -> None:
    """Populate ``os.environ`` from ``.env`` files (without overriding it)."""
    for path in paths or ENV_FILES:
        if path.is_file():
            load_dotenv(path, override=False)


load_env_files()


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
