"""The quality template the AI polishes a figure towards.

A "template" is the target for a clean, publication-quality scientific figure.
The two-pass polisher uses ``TUNABLE_FIELDS`` to ask the Decisions API first
whether each field should change (pass 1: predicate) and then which value it
should take (pass 2: choice).
"""

from __future__ import annotations

from typing import Any


TEMPLATE: dict[str, Any] = {
    "style": {
        "palette": "scientific",
        "background": "#ffffff",
        "font": {"family": "Inter, sans-serif", "size": 13},
        "legend": {"show": True, "position": "top", "orientation": "h", "fontSize": 12},
        "axes": {"x": {"grid": False}, "y": {"grid": True}},
        "marker": {"size": 7, "opacity": 0.9},
        "margins": {"l": 70, "r": 30, "t": 70, "b": 60},
        "size": {"width": 1000, "height": 620},
    }
}

# Each tunable field: a dotted path into the spec, the allowed values (with a
# short description for the model), and the template's recommended value.
TUNABLE_FIELDS: list[dict[str, Any]] = [
    {
        "key": "palette",
        "path": ["style", "palette"],
        "label": "colour palette",
        "options": [
            ("default", "Plotly's default colours"),
            ("scientific", "muted, publication-friendly scientific palette"),
            ("colorblind", "colourblind-safe palette"),
            ("grayscale", "grayscale"),
        ],
        "recommended": "scientific",
    },
    {
        "key": "legendPosition",
        "path": ["style", "legend", "position"],
        "label": "legend position",
        "options": [
            ("right", "to the right of the plot"),
            ("top", "above the plot, horizontal"),
            ("bottom", "below the plot"),
        ],
        "recommended": "top",
    },
    {
        "key": "legendOrientation",
        "path": ["style", "legend", "orientation"],
        "label": "legend orientation",
        "options": [("h", "horizontal"), ("v", "vertical")],
        "recommended": "h",
    },
    {
        "key": "xGrid",
        "path": ["style", "axes", "x", "grid"],
        "label": "x-axis grid",
        "options": [("false", "hide the x grid"), ("true", "show the x grid")],
        "recommended": "false",
    },
    {
        "key": "yGrid",
        "path": ["style", "axes", "y", "grid"],
        "label": "y-axis grid",
        "options": [("false", "hide the y grid"), ("true", "show the y grid")],
        "recommended": "true",
    },
    {
        "key": "markerSize",
        "path": ["style", "marker", "size"],
        "label": "marker size",
        "options": [("5", "small"), ("7", "medium"), ("10", "large")],
        "recommended": "7",
    },
    {
        "key": "fontSize",
        "path": ["style", "font", "size"],
        "label": "font size",
        "options": [("11", "compact"), ("13", "comfortable"), ("15", "large")],
        "recommended": "13",
    },
]


def get_path(spec: dict, path: list[str]) -> Any:
    node: Any = spec
    for key in path:
        if not isinstance(node, dict) or key not in node:
            return None
        node = node[key]
    return node


def set_path(target: dict, path: list[str], value: Any) -> None:
    node = target
    for key in path[:-1]:
        node = node.setdefault(key, {})
    node[path[-1]] = value


def coerce_recommended(raw: str, recommended: str) -> Any:
    """Map a chosen option string back to a typed value."""
    if recommended in ("true", "false"):
        return raw == "true"
    if recommended.replace(".", "", 1).isdigit():
        return float(raw) if "." in raw else int(raw)
    return raw
