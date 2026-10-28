"""Pure compiler: FigureSpec + DataFrame -> Plotly figure.

The compiler performs semantic validation (columns exist, chart-type column
requirements, ranges valid) and produces a plain ``{"data": [...], "layout": {}}``
object. It never executes model-provided code.
"""

from __future__ import annotations

import json
import re

import pandas as pd
import plotly.graph_objects as go

from .errors import SpecValidationError
from .jsonutil import to_jsonable
from .models.figure_spec import (
    FilterTransform,
    FigureSpec,
    GroupbyTransform,
    LimitTransform,
    SortTransform,
    StyleSpec,
)

PALETTES: dict[str, list[str] | None] = {
    "default": None,
    "scientific": [
        "#1f3b73", "#2a9d8f", "#e9c46a", "#e76f51",
        "#264653", "#8ab17d", "#f4a261", "#6a4c93",
    ],
    "colorblind": [
        "#0072B2", "#E69F00", "#009E73", "#D55E00",
        "#CC79A7", "#56B4E9", "#F0E442", "#000000",
    ],
    "grayscale": [
        "#000000", "#333333", "#666666", "#8c8c8c",
        "#b3b3b3", "#d9d9d9", "#4d4d4d", "#737373",
    ],
}

# req = required, opt = optional, forbidden = must be absent
CHART_MATRIX: dict[str, dict[str, str]] = {
    "scatter": {"x": "req", "y": "req", "color": "opt"},
    "line": {"x": "req", "y": "req", "color": "opt"},
    "bar": {"x": "req", "y": "req", "color": "opt"},
    "box": {"x": "opt", "y": "req", "color": "opt"},
    "histogram": {"x": "req", "y": "forbidden", "color": "opt"},
    "violin": {"x": "opt", "y": "req", "color": "opt"},
    "heatmap": {"x": "req", "y": "req", "color": "opt"},
    "area": {"x": "req", "y": "req", "color": "opt"},
}

# A clean, publication-oriented rendering theme. Applied on top of the spec so
# even a bare FigureSpec (e.g. straight from the fast Decisions path) looks
# finished. Colours are deliberately restrained: light gridlines, thin neutral
# axis lines, muted tick labels.
THEME: dict[str, str] = {
    "text": "#1c2330",
    "muted": "#66707f",
    "grid": "#e7ebf0",
    "axis_line": "#c2cad6",
}

HEATMAP_COLORSCALE = "Viridis"



# --------------------------------------------------------------------------- #
# Transforms
# --------------------------------------------------------------------------- #

def apply_transforms(
    df: pd.DataFrame, transforms: list, errors: list[dict]
) -> pd.DataFrame:
    for index, transform in enumerate(transforms):
        if isinstance(transform, FilterTransform):
            column = transform.column
            if column not in df.columns:
                errors.append(
                    {
                        "path": f"transforms[{index}].column",
                        "message": f"unknown column '{column}'",
                    }
                )
                continue
            df = df[df[column].isin(transform.in_)]

        elif isinstance(transform, GroupbyTransform):
            missing = [c for c in transform.by if c not in df.columns]
            missing += [c for c in transform.agg if c not in df.columns]
            if missing:
                for column in missing:
                    errors.append(
                        {
                            "path": f"transforms[{index}]",
                            "message": f"unknown column '{column}'",
                        }
                    )
                continue
            df = (
                df.groupby(transform.by, dropna=False)
                .agg(transform.agg)
                .reset_index()
            )

        elif isinstance(transform, SortTransform):
            if transform.column not in df.columns:
                errors.append(
                    {
                        "path": f"transforms[{index}].column",
                        "message": f"unknown column '{transform.column}'",
                    }
                )
                continue
            df = df.sort_values(transform.column, ascending=not transform.desc)

        elif isinstance(transform, LimitTransform):
            df = df.head(transform.n)

    return df


# --------------------------------------------------------------------------- #
# Semantic validation
# --------------------------------------------------------------------------- #

def validate_spec(spec: FigureSpec, df: pd.DataFrame) -> list[dict]:
    errors: list[dict] = []
    chart_type = spec.figure.chartType
    matrix = CHART_MATRIX[chart_type]

    if not spec.figure.series:
        errors.append(
            {"path": "figure.series", "message": "at least one series is required"}
        )

    for index, series in enumerate(spec.figure.series):
        for axis in ("x", "y", "color"):
            value = getattr(series, axis)
            requirement = matrix[axis]
            if requirement == "req" and not value:
                errors.append(
                    {
                        "path": f"figure.series[{index}].{axis}",
                        "message": f"chart type '{chart_type}' requires '{axis}'",
                    }
                )
            elif value and value not in df.columns:
                errors.append(
                    {
                        "path": f"figure.series[{index}].{axis}",
                        "message": f"unknown column '{value}'",
                    }
                )
            elif requirement == "forbidden" and value:
                errors.append(
                    {
                        "path": f"figure.series[{index}].{axis}",
                        "message": f"chart type '{chart_type}' does not use '{axis}'",
                    }
                )

    for axis_name, axis in (("x", spec.style.axes.x), ("y", spec.style.axes.y)):
        low, high = axis.range
        if low is not None and high is not None and low > high:
            errors.append(
                {
                    "path": f"style.axes.{axis_name}.range",
                    "message": "range minimum is greater than maximum",
                }
            )

    return errors


# --------------------------------------------------------------------------- #
# Building
# --------------------------------------------------------------------------- #

def _values(df: pd.DataFrame, column: str) -> list:
    return [to_jsonable(value) for value in df[column].tolist()]


def _colorway(style: StyleSpec) -> list[str] | None:
    if style.colorway:
        return list(style.colorway)
    return PALETTES.get(style.palette)


def _humanize(name: str | None) -> str:
    """Turn a column name into a readable label ('engagement_rate' -> 'Engagement rate')."""
    if not name:
        return ""
    text = re.sub(r"[_\-]+", " ", str(name)).strip()
    text = re.sub(r"\s+", " ", text)
    return text[:1].upper() + text[1:] if text else ""


def _auto_title(spec: FigureSpec) -> str:
    series = spec.figure.series[0] if spec.figure.series else None
    if series is None:
        return ""
    chart = spec.figure.chartType
    if chart == "histogram":
        return f"Distribution of {_humanize(series.x)}".strip()
    if series.y and series.x:
        if chart == "scatter":
            return f"{_humanize(series.y)} vs {_humanize(series.x)}"
        if chart in ("line", "area"):
            return f"{_humanize(series.y)} over {_humanize(series.x)}"
        return f"{_humanize(series.y)} by {_humanize(series.x)}"
    if series.y:
        return _humanize(series.y)
    return _humanize(series.x)


def _auto_axis_label(spec: FigureSpec, axis: str) -> str:
    series = spec.figure.series[0] if spec.figure.series else None
    if series is None:
        return ""
    if axis == "x":
        return _humanize(series.x)
    if spec.figure.chartType == "histogram":
        return "Count"
    if spec.figure.chartType == "heatmap":
        return _humanize(series.color)
    return _humanize(series.y)



def _build_trace(
    chart_type: str,
    x,
    y,
    name: str,
    style: StyleSpec,
    color: str | None,
):
    marker = style.marker
    line = style.line
    marker_kwargs = {
        "size": marker.size,
        "opacity": marker.opacity,
        "symbol": marker.symbol,
    }
    line_kwargs: dict = {"width": line.width}
    if color:
        line_kwargs["color"] = color

    if chart_type == "scatter":
        if color:
            marker_kwargs["color"] = color
        return go.Scatter(x=x, y=y, name=name, mode="markers", marker=marker_kwargs)
    if chart_type == "line":
        return go.Scatter(x=x, y=y, name=name, mode="lines", line=line_kwargs)
    if chart_type == "area":
        return go.Scatter(
            x=x, y=y, name=name, mode="lines", line=line_kwargs, stackgroup="one"
        )
    if chart_type == "bar":
        return go.Bar(
            x=x,
            y=y,
            name=name,
            marker={"opacity": marker.opacity, "color": color},
        )
    if chart_type == "box":
        return go.Box(
            x=x,
            y=y,
            name=name,
            marker={"size": marker.size, "opacity": marker.opacity, "color": color},
        )
    if chart_type == "violin":
        return go.Violin(
            x=x,
            y=y,
            name=name,
            box_visible=True,
            meanline_visible=True,
            line={"color": color} if color else None,
        )
    if chart_type == "histogram":
        return go.Histogram(
            x=x,
            name=name,
            opacity=marker.opacity,
            marker={"color": color},
        )
    raise SpecValidationError(
        [{"path": "figure.chartType", "message": f"unsupported chart type '{chart_type}'"}]
    )


def _series_traces(
    chart_type: str, series, df: pd.DataFrame, style: StyleSpec
) -> list:
    colorway = _colorway(style)
    traces: list = []

    if series.color and series.color in df.columns:
        groups = df.groupby(series.color, dropna=False, sort=True)
        for position, (value, subset) in enumerate(groups):
            name = series.name or f"{series.color} = {to_jsonable(value)}"
            color = colorway[position % len(colorway)] if colorway else None
            traces.append(
                _build_trace(
                    chart_type,
                    _values(subset, series.x) if series.x else None,
                    _values(subset, series.y) if series.y else None,
                    str(name),
                    style,
                    color,
                )
            )
        return traces

    name = series.name or series.y or series.x or "series"
    color = colorway[0] if colorway else None
    traces.append(
        _build_trace(
            chart_type,
            _values(df, series.x) if series.x else None,
            _values(df, series.y) if series.y else None,
            str(name),
            style,
            color,
        )
    )
    return traces


def _axis_config(axis, label: str, font_size: int) -> dict:
    config: dict = {
        "showgrid": axis.grid,
        "gridcolor": THEME["grid"],
        "gridwidth": 1,
        "zeroline": False,
        "showline": True,
        "linecolor": THEME["axis_line"],
        "linewidth": 1,
        "ticks": "outside",
        "ticklen": 4,
        "tickwidth": 1,
        "tickcolor": THEME["axis_line"],
        "tickfont": {"size": max(9, font_size - 1), "color": THEME["muted"]},
        "title": {
            "text": label or "",
            "font": {"size": font_size, "color": THEME["text"]},
            "standoff": 8,
        },
    }
    if axis.scale == "log":
        config["type"] = "log"
    low, high = axis.range
    if low is not None and high is not None:
        config["range"] = [high, low] if axis.reverse else [low, high]
    elif axis.reverse:
        config["autorange"] = "reversed"
    if axis.tickMode == "step" and axis.tickStep is not None:
        config["tickmode"] = "linear"
        config["dtick"] = axis.tickStep
    elif axis.tickMode == "count" and axis.tickCount is not None:
        config["nticks"] = axis.tickCount
    if axis.tickRotation:
        config["tickangle"] = axis.tickRotation
    return config


def _legend_config(style: StyleSpec) -> dict:
    legend = {
        "orientation": style.legend.orientation,
        "font": {"size": style.legend.fontSize, "color": THEME["text"]},
        "bgcolor": "rgba(0,0,0,0)",
        "borderwidth": 0,
    }
    position = style.legend.position
    if position == "top":
        legend.update(x=0, y=1.02, xanchor="left", yanchor="bottom")
    elif position == "bottom":
        legend.update(x=0, y=-0.15, xanchor="left", yanchor="top")
    elif position == "left":
        legend.update(x=-0.02, y=1, xanchor="right", yanchor="top")
    else:
        legend.update(x=1.02, y=1, xanchor="left", yanchor="top")
    if style.legend.title:
        legend["title"] = {"text": style.legend.title}
    if style.legend.columns and style.legend.columns > 1:
        legend["entrywidthmode"] = "fraction"
        legend["entrywidth"] = 1.0 / style.legend.columns
    return legend


def _heatmap_traces(spec: FigureSpec, df: pd.DataFrame) -> list:
    series = spec.figure.series[0]
    value, column, row = series.y, series.x, series.color
    if not column or column not in df.columns or not value or value not in df.columns:
        return []
    if row and row in df.columns:
        pivot = df.pivot_table(
            index=row, columns=column, values=value, aggfunc="mean"
        )
    else:
        pivot = df.groupby(column, dropna=False)[value].mean().to_frame().T
    z = [[to_jsonable(v) for v in row_values] for row_values in pivot.values]
    return [
        go.Heatmap(
            z=z,
            x=[to_jsonable(c) for c in pivot.columns],
            y=[to_jsonable(i) for i in pivot.index],
            colorscale=HEATMAP_COLORSCALE,
            colorbar={"title": {"text": _humanize(value), "side": "right"}},
            hovertemplate="%{x} · %{y}<br>%{z:.4g}<extra></extra>",
        )
    ]


def _build_layout(
    spec: FigureSpec, responsive: bool = False, n_traces: int = 1
) -> go.Layout:
    style = spec.style
    figure_title = style.title if style.title is not None else _auto_title(spec)
    title: dict = {
        "text": figure_title or "",
        "font": {"size": style.font.size + 6, "color": THEME["text"]},
    }
    if style.subtitle:
        title["subtitle"] = {
            "text": style.subtitle,
            "font": {"size": style.font.size + 1, "color": THEME["muted"]},
        }
    x_label = (
        style.axes.x.label
        if style.axes.x.label is not None
        else _auto_axis_label(spec, "x")
    )
    y_label = (
        style.axes.y.label
        if style.axes.y.label is not None
        else _auto_axis_label(spec, "y")
    )
    # A legend is only useful with more than one entry; hide the redundant
    # single-series legend unless the user explicitly titled it.
    show_legend = style.legend.show and (
        n_traces > 1 or style.legend.title is not None
    )
    layout = go.Layout(
        title=title,
        font={"family": style.font.family, "size": style.font.size, "color": THEME["text"]},
        paper_bgcolor=style.background,
        plot_bgcolor=style.background,
        margin={
            "l": style.margins.l,
            "r": style.margins.r,
            "t": style.margins.t,
            "b": style.margins.b,
        },
        showlegend=show_legend,
        legend=_legend_config(style),
        xaxis=_axis_config(style.axes.x, x_label, style.font.size),
        yaxis=_axis_config(style.axes.y, y_label, style.font.size),
        hovermode="x unified" if spec.figure.chartType in ("line", "area") else "closest",
        hoverlabel={
            "bgcolor": "#ffffff",
            "bordercolor": THEME["axis_line"],
            "font": {"color": THEME["text"], "size": style.font.size},
        },
    )
    if responsive:
        layout.autosize = True
    else:
        layout.width = style.size.width
        layout.height = style.size.height
    colorway = _colorway(style)
    if colorway:
        layout.colorway = colorway
    return layout


def _apply_legend_order(traces: list, order: list[str] | None) -> list:
    if not order:
        return traces
    rank = {name: index for index, name in enumerate(order)}
    return sorted(traces, key=lambda t: rank.get(getattr(t, "name", None), len(rank)))


def build_plotly_figure(
    spec: FigureSpec, df: pd.DataFrame, figure_dict: dict | None = None
) -> go.Figure:
    if figure_dict is not None:
        return go.Figure(figure_dict)
    return compile_plotly(spec, df)


def compile_plotly(
    spec: FigureSpec, df: pd.DataFrame, responsive: bool = False
) -> go.Figure:
    errors: list[dict] = []
    working = apply_transforms(df, spec.transforms, errors)
    errors.extend(validate_spec(spec, working))
    if errors:
        raise SpecValidationError(errors)

    chart_type = spec.figure.chartType
    traces: list = []
    if chart_type == "heatmap":
        traces = _heatmap_traces(spec, working)
    else:
        for series in spec.figure.series:
            traces.extend(_series_traces(chart_type, series, working, spec.style))
    traces = _apply_legend_order(traces, spec.style.legend.order)

    return go.Figure(
        data=traces,
        layout=_build_layout(spec, responsive=responsive, n_traces=len(traces)),
    )


def compile_figure(spec: FigureSpec, df: pd.DataFrame) -> dict:
    """Compile a FigureSpec + DataFrame into a JSON-safe Plotly figure dict.

    The result is responsive (``autosize``) so the preview fills its container;
    export overrides the size explicitly via :func:`export.export_figure`.
    """
    figure = compile_plotly(spec, df, responsive=True)
    return json.loads(figure.to_json())
