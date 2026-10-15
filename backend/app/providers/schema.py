"""Shared helpers for reading the reduced dataset summary.

The summary is ``{id, contentHash, rows, columns, stats, sample}``. Providers use
these helpers so the schema-navigation logic lives in one place.
"""

from __future__ import annotations

import json
from typing import Optional


def column_names(dataset: dict, dtype: Optional[str] = None) -> list[str]:
    columns = dataset.get("columns", [])
    if dtype is None:
        return [column["name"] for column in columns]
    return [column["name"] for column in columns if column.get("dtype") == dtype]


def dataset_context(dataset: dict, sample_rows: int = 5) -> str:
    """A compact JSON summary (schema + statistics + a small sample) to send to
    a model. Never includes the full dataset."""
    return json.dumps(
        {
            "columns": dataset.get("columns", []),
            "stats": dataset.get("stats", {}),
            "sample": dataset.get("sample", [])[:sample_rows],
        }
    )
