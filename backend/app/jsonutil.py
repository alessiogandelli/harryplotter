"""Convert pandas / numpy / datetime values into JSON-safe Python values."""

from __future__ import annotations

import datetime as _dt
import math

import numpy as np
import pandas as pd


def to_jsonable(value):
    """Best-effort conversion of a scalar into a JSON-serializable value."""
    if value is None:
        return None
    if isinstance(value, (str, bool, int)) and not isinstance(value, (np.generic,)):
        return value
    if isinstance(value, float):
        return None if (math.isnan(value) or math.isinf(value)) else value
    if isinstance(value, np.floating):
        f = float(value)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, (pd.Timestamp, _dt.datetime, _dt.date, _dt.time)):
        return value.isoformat()
    if isinstance(value, pd.Timedelta):
        return str(value)
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(v) for v in value]
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return str(value)
