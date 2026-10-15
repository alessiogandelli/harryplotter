"""Deterministic, network-free provider used by tests and as the default."""

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


def choose_chart_type(prompt: str) -> str:
    text = prompt.lower()
    explicit = [
        ("scatter", "scatter"),
        ("line", "line"),
        ("bar", "bar"),
        ("box", "box"),
        ("violin", "violin"),
        ("histogram", "histogram"),
        ("heatmap", "heatmap"),
        ("heat map", "heatmap"),
        ("area", "area"),
    ]
    for keyword, chart in explicit:
        if keyword in text:
            return chart
    if "trend" in text or "over time" in text:
        return "line"
    if "distribution" in text:
        return "box"
    return "scatter"


def choose_columns(
    chart: str,
    numeric: list[str],
    categorical: list[str],
    datetime_cols: list[str],
    all_cols: list[str],
) -> tuple[str | None, str | None, str | None]:
    def first(seq):
        return seq[0] if seq else None

    x = y = color = None
    if chart == "histogram":
        x = first(numeric) or first(all_cols)
    elif chart in ("box", "violin"):
        y = first(numeric) or first(all_cols)
        x = first(categorical)
    elif chart == "bar":
        x = first(categorical) or first(datetime_cols) or first(numeric) or first(all_cols)
        y = next((c for c in numeric if c != x), first(numeric))
    elif chart == "heatmap":
        x = first(datetime_cols) or first(numeric) or first(all_cols)
        y = next((c for c in numeric if c != x), first(numeric))
    else:  # scatter, line, area
        x = first(datetime_cols) or first(numeric) or first(all_cols)
        y = next((c for c in numeric if c != x), first(numeric) or first(all_cols))

    if chart != "heatmap":
        color = first(categorical)
    return x, y, color


class FakeProvider(ChartProvider):
    name = "fake"

    def generate(self, prompt: str, dataset: dict) -> ProviderResult:
        numeric = column_names(dataset, "numeric")
        categorical = column_names(dataset, "categorical") + column_names(dataset, "boolean")
        datetime_cols = column_names(dataset, "datetime")
        all_cols = column_names(dataset)

        chart = choose_chart_type(prompt)
        x, y, color = choose_columns(chart, numeric, categorical, datetime_cols, all_cols)

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
        partial = self._build_patch(prompt, current)
        merged = apply_patch(current, partial)
        new_spec = parse_figure_spec(merged)
        return ProviderResult(
            spec=new_spec,
            provider=self.name,
            confidence=PATCH_CONFIDENCE,
            patch=partial,
        )

    @staticmethod
    def _build_patch(prompt: str, current: dict) -> dict:
        text = prompt.lower()
        words = re.findall(r"[a-z0-9]+", text)
        style: dict = {}
        legend: dict = {}
        axes: dict = {"x": {}, "y": {}}

        if "legend" in words or "key" in words:
            for where in ("top", "bottom", "left", "right"):
                if where in words:
                    legend["position"] = where
            if "horizontal" in words:
                legend["orientation"] = "h"
            if "vertical" in words:
                legend["orientation"] = "v"
            match = re.search(r"(one|two|three|four|five|six|\d+)\s+(rows|columns|columns?)", text)
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
        if style:
            patch["style"] = style
        return patch
