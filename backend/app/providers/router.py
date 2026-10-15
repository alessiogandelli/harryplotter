"""Router: known (fast Decisions path) vs novel (Structured path)."""

from __future__ import annotations

NOVEL_HINTS = ("violin", "heatmap", "heat map", "area", "radar", "3d", "contour", "novel")
KNOWN_HINTS = ("scatter", "line", "bar", "box", "histogram", "trend", "distribution", "over time")


def pick(prompt: str, dataset: dict | None = None) -> str:
    """Return "known" or "novel" using a keyword heuristic.

    When a Decisions-capable provider is configured this could be a Decisions
    ``choice`` question; the heuristic is the documented fallback.
    """
    text = prompt.lower()
    if any(hint in text for hint in NOVEL_HINTS):
        return "novel"
    return "known"
