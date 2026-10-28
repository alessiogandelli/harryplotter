"""Router: which provider handles a request.

Generation always uses the Structured (LLM) path so a fresh figure is built from
the full request. Refinements are split: small, closed-vocabulary style tweaks go
to the fast Decisions path; anything structural (chart type, columns, labels,
aggregation) goes to the LLM, which can express the whole spec.
"""

from __future__ import annotations

import re

NOVEL_HINTS = ("violin", "heatmap", "heat map", "area", "radar", "3d", "contour", "novel")
KNOWN_HINTS = ("scatter", "line", "bar", "box", "histogram", "trend", "distribution", "over time")

# Tweaks the Decisions provider answers well (enumerated, no free text).
_STYLE_HINTS = (
    "legend", "key", "palette", "colour", "color", "grayscale", "greyscale",
    "colorblind", "colourblind", "scientific", "log", "linear", "scale", "grid",
)
# Anything structural needs the full-spec LLM path.
_STRUCTURAL_HINTS = (
    "scatter", "line", "bar", "histogram", "hist", "box", "violin", "heatmap",
    "heat map", "area", "title", "label", "column", "filter",
    "sort", "order", "limit", "aggregate", "group", "by ", "average",
    "mean", "median", "sum", "count", "correlation", "trend", "over time",
    "distribution", "color by", "colour by", "split",
)


def _has_word(text: str, hints: tuple[str, ...]) -> bool:
    return any(re.search(rf"(?<![a-z0-9]){re.escape(hint)}(?![a-z0-9])", text) for hint in hints)


def pick(prompt: str, dataset: dict | None = None) -> str:
    """Return "known" (Decisions path) or "novel" (Structured path)."""
    text = prompt.lower()
    if _has_word(text, NOVEL_HINTS):
        return "novel"
    return "known"


def is_simple_refinement(prompt: str) -> bool:
    """True when a refinement maps onto the Decisions provider's closed questions."""
    text = prompt.lower()
    if _has_word(text, _STRUCTURAL_HINTS):
        return False
    return _has_word(text, _STYLE_HINTS)
