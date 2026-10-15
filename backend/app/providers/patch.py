"""Partial-patch application (JSON-merge-patch style, dict-subtree aware).

Refinement must change only the properties addressed by the request and
preserve everything else, so patches are deep-merged into the current spec.
"""

from __future__ import annotations

from typing import Any


def deep_merge(base: Any, patch: Any) -> Any:
    if isinstance(base, dict) and isinstance(patch, dict):
        merged = dict(base)
        for key, value in patch.items():
            if key in merged:
                merged[key] = deep_merge(merged[key], value)
            else:
                merged[key] = value
        return merged
    return patch


def apply_patch(current: dict, patch: dict) -> dict:
    """Return a new spec dict with ``patch`` merged in; ``current`` is unchanged."""
    return deep_merge(dict(current), patch)
