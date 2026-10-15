"""Deterministic, network-free provider used by tests and as the default.

It reads the prompt for an explicit chart type and for dataset column names so a
request like "bar plot of engagement by topic" maps onto the right columns. This
keeps the keyless demo genuinely usable; the real providers do the same job with
a model.
"""

from __future__ import annotations

import re

from ..models.figure_spec import FigureSpec, dump_figure_spec, parse_figure_spec
from .base import ChartProvider, ProviderResult
from .patch import apply_patch
from .schema import column_names

GENERATE_CONFIDENCE = 0.9
PATCH_CONFIDENCE = 0.85

_WORD_NUMBERS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6,
}

_EXPLICIT_CHARTS = [
    ("scatter", "scatter"),
    ("scatterplot", "scatter"),
    ("line", "line"),
    ("bar", "bar"),
    ("histogram", "histogram"),
    ("hist", "histogram"),
    ("box", "box"),
    ("violin", "violin"),
    ("heatmap", "heatmap"),
    ("heat map", "heatmap"),
    ("area", "area"),
]


def explicit_chart_type(text: str) -> str | None:
    """The chart type named in the text, or None if none is mentioned."""
    lowered = text.lower()
    for keyword, chart in _EXPLICIT_CHARTS:
        if keyword in lowered:
            return chart
    return None


def choose_chart_type(prompt: str) -> str:
    explicit = explicit_chart_type(prompt)
    if explicit:
        return explicit
    text = prompt.lower()
    if "trend" in text or "over time" in text:
        return "line"
    if "distribution" in text or "spread" in text:
        return "box"
    return "scatter"


def _mentioned(lower: str, names: list[str]) -> list[str]:
    """Names appearing in the prompt, in prompt order of first appearance."""
    hits: list[tuple[int, str]] = []
    for name in names:
        for variant in {name.lower(), name.lower().replace("_", " ")}:
            position = lower.find(variant)
            if position != -1:
                hits.append((position, name))
                break
    return [name for _, name in sorted(hits)]


def _after(text: str, separator: str) -> str:
    return text.split(separator, 1)[1] if separator in text else ""


def _before(text: str, separator: str) -> str:
    return text.split(separator, 1)[0] if separator in text else text


def choose_columns(
    chart: str,
    numeric: list[str],
    categorical: list[str],
    datetime_cols: list[str],
    all_cols: list[str],
    prompt: str = "",
) -> tuple[str | None, str | None, str | None]:
    text = prompt.lower()

    # "measure by group" / "measure over axis" phrasing.
    by_group = _mentioned(_after(text, " by "), all_cols)
    over_axis = _mentioned(_after(text, " over "), all_cols)
    measure = (
        _mentioned(_before(text, " by "), numeric)
        or _mentioned(_before(text, " over "), numeric)
        or _mentioned(_after(text, " of "), numeric)
        or _mentioned(text, numeric)
    )
    cat_match = _mentioned(text, categorical)
    dt_match = _mentioned(text, datetime_cols)

    def first(seq):
        return seq[0] if seq else None

    def next_measure(exclude):
        return next((c for c in (measure or numeric) if c != exclude), None)

    x = y = color = None
    if chart == "histogram":
        x = first(measure) or first(numeric) or first(all_cols)
    elif chart in ("box", "violin"):
        y = first(measure) or first(numeric) or first(all_cols)
        x = first(by_group) or first(cat_match) or first(categorical)
    elif chart == "bar":
        x = (
            first(by_group)
            or first(cat_match)
            or first(dt_match)
            or first(categorical)
            or first(datetime_cols)
            or first(numeric)
            or first(all_cols)
        )
        y = first(measure) or next_measure(x) or first(numeric)
    elif chart == "heatmap":
        x = (
            first(over_axis)
            or first(by_group)
            or first(dt_match)
            or first(cat_match)
            or first(all_cols)
        )
        y = first(measure) or next_measure(x) or first(numeric)
    else:  # scatter, line, area
        nums = _mentioned(text, numeric)
        if over_axis:
            x = first(over_axis)
            y = first(measure) or next_measure(x) or first(numeric)
        elif len(nums) >= 2:
            x, y = nums[1], nums[0]
        elif by_group:
            x = first(dt_match) or next_measure(first(measure)) or first(all_cols)
            y = first(measure) or first(numeric)
        else:
            x = first(dt_match) or first(numeric) or first(all_cols)
            y = first(measure) or next_measure(x) or first(numeric)

    if chart in ("bar", "box", "violin", "histogram", "heatmap"):
        color = None
    else:
        color = next((c for c in categorical if c not in (x, y)), None)
    return x, y, color


class FakeProvider(ChartProvider):
    name = "fake"

    def generate(self, prompt: str, dataset: dict) -> ProviderResult:
        numeric = column_names(dataset, "numeric")
        categorical = column_names(dataset, "categorical") + column_names(dataset, "boolean")
        datetime_cols = column_names(dataset, "datetime")
        all_cols = column_names(dataset)

        chart = choose_chart_type(prompt)
        x, y, color = choose_columns(
            chart, numeric, categorical, datetime_cols, all_cols, prompt
        )

        series: dict = {}
        if x is not None:
            series["x"] = x
        if y is not None:
            series["y"] = y
        if color is not None:
            series["color"] = color

        if y and x:
            title = f"{y} over {x}"
        elif x:
            title = f"{chart} of {x}"
        else:
            title = chart

        spec_dict = {
            "version": 1,
            "dataset": {"id": dataset.get("id"), "contentHash": dataset.get("contentHash")},
            "transforms": [],
            "figure": {"chartType": chart, "series": [series]},
            "style": {"title": title},
            "meta": {"modelVersion": "fake-v1"},
        }
        spec = parse_figure_spec(spec_dict)
        return ProviderResult(
            spec=spec, provider=self.name, confidence=GENERATE_CONFIDENCE
        )

    def patch(self, prompt: str, spec: FigureSpec, dataset: dict) -> ProviderResult:
        current = dump_figure_spec(spec)
        partial = self._build_patch(prompt, current, dataset)
        merged = apply_patch(current, partial)
        new_spec = parse_figure_spec(merged)
        return ProviderResult(
            spec=new_spec,
            provider=self.name,
            confidence=PATCH_CONFIDENCE,
            patch=partial,
        )

    @staticmethod
    def _build_patch(prompt: str, current: dict, dataset: dict) -> dict:
        text = prompt.lower()
        words = re.findall(r"[a-z0-9]+", text)
        figure: dict = {}
        style: dict = {}
        legend: dict = {}
        axes: dict = {"x": {}, "y": {}}

        # Changing the chart type (a refinement can do this too).
        new_chart = explicit_chart_type(text)
        current_chart = current.get("figure", {}).get("chartType")
        if new_chart and new_chart != current_chart:
            numeric = column_names(dataset, "numeric")
            categorical = column_names(dataset, "categorical") + column_names(dataset, "boolean")
            datetime_cols = column_names(dataset, "datetime")
            all_cols = column_names(dataset)
            x, y, color = choose_columns(
                new_chart, numeric, categorical, datetime_cols, all_cols, prompt
            )
            series: dict = {}
            if x is not None:
                series["x"] = x
            if y is not None:
                series["y"] = y
            if color is not None:
                series["color"] = color
            figure = {"chartType": new_chart, "series": [series]}

        if "legend" in words or "key" in words:
            for where in ("top", "bottom", "left", "right"):
                if where in words:
                    legend["position"] = where
            if "horizontal" in words:
                legend["orientation"] = "h"
            if "vertical" in words:
                legend["orientation"] = "v"
            match = re.search(
                r"(one|two|three|four|five|six|\d+)\s+(rows|columns|columns?)", text
            )
            if match:
                legend["columns"] = _WORD_NUMBERS.get(match.group(1), 2)
            if re.search(r"hide|no legend|remove the legend|without (a )?legend", text):
                legend["show"] = False
            elif re.search(r"show (the )?legend", text):
                legend["show"] = True

        if "colorblind" in words or "colourblind" in words or "colour-blind" in text:
            style["palette"] = "colorblind"
        elif "grayscale" in words or "greyscale" in words or "gray-scale" in text:
            style["palette"] = "grayscale"
        elif "scientific" in words:
            style["palette"] = "scientific"

        title_match = re.search(r"title[^\"'\n]*[\"']([^\"']+)[\"']", prompt)
        if title_match:
            style["title"] = title_match.group(1)
        elif re.search(r"remove the title|no title|hide the title", text):
            style["title"] = None

        target = "y"
        if re.search(r"\bx[- ]?axis|\bx\b", text) and not re.search(r"\by[- ]?axis", text):
            target = "x"
        if "log" in words:
            axes[target]["scale"] = "log"
        elif "linear" in words:
            axes[target]["scale"] = "linear"
        if "reverse" in words:
            axes[target]["reverse"] = True

        if "grid" in words:
            if re.search(r"hide|off|remove|no grid|without (a )?grid", text):
                axes[target]["grid"] = False
            elif re.search(r"show|on|\bwith\b", text):
                axes[target]["grid"] = True

        # Axis range: "limit the x axis between 0 and 10", "set the y range from
        # -1 to 1", "zoom x to 20-80", or "clear the range".
        if re.search(r"\brange\b|\blimit\b|\bzoom\b|\bbetween\b", text):
            if "range" in words and re.search(r"clear|reset|remove|auto", text):
                axes[target]["range"] = [None, None]
            else:
                span = re.search(
                    r"(-?\d+(?:\.\d+)?)\s*(?:to|and|through|–|—|-)\s*(-?\d+(?:\.\d+)?)",
                    text,
                )
                if span:
                    low, high = float(span.group(1)), float(span.group(2))
                    axes[target]["range"] = [min(low, high), max(low, high)]

        marker_match = re.search(r"marker size\s+([0-9]+(?:\.[0-9]+)?)", text)
        if marker_match:
            style["marker"] = {"size": float(marker_match.group(1))}
        line_match = re.search(r"line width\s+([0-9]+(?:\.[0-9]+)?)", text)
        if line_match:
            style["line"] = {"width": float(line_match.group(1))}
        font_match = re.search(r"font size\s+([0-9]+)", text)
        if font_match:
            style["font"] = {"size": int(font_match.group(1))}

        patch: dict = {}
        if legend:
            style["legend"] = legend
        if axes["x"] or axes["y"]:
            style["axes"] = {k: v for k, v in axes.items() if v}
        if figure:
            patch["figure"] = figure
        if style:
            patch["style"] = style
        return patch
