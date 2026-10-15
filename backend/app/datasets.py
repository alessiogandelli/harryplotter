"""Dataset ingestion: parse CSV/Excel, detect dtypes, compute stats and sample."""

from __future__ import annotations

import hashlib
import io
import uuid
from pathlib import Path

import pandas as pd

from . import config, db
from .jsonutil import to_jsonable

MAX_SAMPLE_ROWS = 20
CSV_EXTENSIONS = {".csv", ".txt"}
EXCEL_EXTENSIONS = {".xlsx", ".xls"}
ALLOWED_EXTENSIONS = CSV_EXTENSIONS | EXCEL_EXTENSIONS
DTYPE_VALUES = {"numeric", "categorical", "datetime", "boolean"}


class DatasetError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def content_hash(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def _extension(filename: str) -> str:
    return Path(filename or "").suffix.lower()


def load_dataframe(data: bytes, filename: str) -> pd.DataFrame:
    ext = _extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise DatasetError(
            "unsupported_file_type",
            f"unsupported file type '{ext or filename}'; use CSV or Excel",
        )
    buffer = io.BytesIO(data)
    try:
        if ext in CSV_EXTENSIONS:
            return pd.read_csv(buffer)
        return pd.read_excel(buffer)
    except DatasetError:
        raise
    except Exception as exc:  # noqa: BLE001 - surface a clean message
        raise DatasetError("parse_error", f"could not parse '{filename}': {exc}") from exc


def read_dataframe(path: str, filename: str) -> pd.DataFrame:
    return load_dataframe(Path(path).read_bytes(), filename)


def detect_dtype(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    non_null = series.dropna()
    if len(non_null) > 0:
        sample = non_null.head(1000)
        parsed = pd.to_datetime(sample, errors="coerce", format="mixed")
        if parsed.notna().all():
            return "datetime"
    return "categorical"


def _column_meta(df: pd.DataFrame) -> list[dict]:
    columns = []
    for name in df.columns:
        series = df[name]
        columns.append(
            {
                "name": str(name),
                "dtype": detect_dtype(series),
                "missing": int(series.isna().sum()),
            }
        )
    return columns


def _numeric_stats(df: pd.DataFrame, dtypes: dict[str, str]) -> dict:
    stats: dict[str, dict] = {}
    for name, dtype in dtypes.items():
        if dtype != "numeric":
            continue
        series = df[name]
        stats[name] = {
            "count": int(series.count()),
            "mean": to_jsonable(series.mean()),
            "std": to_jsonable(series.std()),
            "min": to_jsonable(series.min()),
            "max": to_jsonable(series.max()),
        }
    return stats


def _sample(df: pd.DataFrame) -> list[dict]:
    head = df.head(MAX_SAMPLE_ROWS)
    records = head.to_dict(orient="records")
    return [{str(k): to_jsonable(v) for k, v in record.items()} for record in records]


def summarize(df: pd.DataFrame, dataset_id: str, filename: str, hash_value: str) -> dict:
    columns = _column_meta(df)
    dtypes = {c["name"]: c["dtype"] for c in columns}
    return {
        "id": dataset_id,
        "filename": filename,
        "rows": int(len(df)),
        "contentHash": hash_value,
        "columns": columns,
        "stats": _numeric_stats(df, dtypes),
        "sample": _sample(df),
    }


def ingest(filename: str, data: bytes, kind: str = "upload") -> dict:
    """Persist an uploaded file and its summary; return the API response."""
    if not data:
        raise DatasetError("empty_file", "uploaded file is empty")
    ext = _extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise DatasetError(
            "unsupported_file_type",
            f"unsupported file type '{ext or filename}'; use CSV or Excel",
        )
    df = load_dataframe(data, filename)
    if df.empty and len(df.columns) == 0:
        raise DatasetError("empty_dataset", "dataset has no columns")

    dataset_id = str(uuid.uuid4())
    hash_value = content_hash(data)
    config.ensure_dirs()
    stored_path = config.datasets_dir() / f"{dataset_id}{ext or '.csv'}"
    stored_path.write_bytes(data)

    summary = summarize(df, dataset_id, filename, hash_value)
    db.insert_dataset(
        id=dataset_id,
        filename=filename,
        path=str(stored_path),
        rows=summary["rows"],
        content_hash=hash_value,
        columns=summary["columns"],
        stats=summary["stats"],
        sample=summary["sample"],
        kind=kind,
    )
    summary["kind"] = kind
    return summary


def seed_samples() -> list[str]:
    """Ingest bundled sample files that are not yet in the library.

    Idempotent: a file whose content hash already exists is skipped, so this can
    run on every boot without duplicating rows.
    """
    directory = config.samples_dir()
    if not directory.is_dir():
        return []
    added: list[str] = []
    for path in sorted(directory.iterdir()):
        if not path.is_file() or path.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue
        data = path.read_bytes()
        if not data or db.find_dataset_by_content_hash(content_hash(data)) is not None:
            continue
        try:
            summary = ingest(path.name, data, kind="sample")
        except DatasetError:
            continue
        added.append(summary["id"])
    return added
