import pandas as pd
import pytest

from app.compiler import compile_figure
from app.errors import SpecValidationError
from app.models.figure_spec import parse_figure_spec


def make_df() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "time": [1, 2, 3, 4],
            "score": [0.3, 0.5, 0.2, 0.9],
            "group": ["A", "B", "A", "B"],
        }
    )


def scatter_spec(**overrides) -> dict:
    base = {
        "version": 1,
        "figure": {"chartType": "scatter", "series": [{"x": "time", "y": "score"}]},
        "style": {"title": "Score over time"},
    }
    base.update(overrides)
    return base


def compile_spec(spec: dict, df: pd.DataFrame | None = None) -> dict:
    return compile_figure(parse_figure_spec(spec), df if df is not None else make_df())


# --------------------------------------------------------------------------- #
# Happy path
# --------------------------------------------------------------------------- #

def test_scatter_traces_and_layout():
    figure = compile_spec(scatter_spec())
    assert figure["data"][0]["x"] == [1, 2, 3, 4]
    assert figure["data"][0]["y"] == [0.3, 0.5, 0.2, 0.9]
    assert figure["data"][0]["type"] == "scatter"
    assert figure["layout"]["title"]["text"] == "Score over time"


def test_color_column_splits_into_one_trace_per_category():
    spec = scatter_spec(
        figure={
            "chartType": "scatter",
            "series": [{"x": "time", "y": "score", "color": "group"}],
        }
    )
    figure = compile_spec(spec)
    names = sorted(trace["name"] for trace in figure["data"])
    assert names == ["group = A", "group = B"]
    assert len(figure["data"]) == 2


def test_log_scale_and_reverse_reach_the_axis():
    spec = scatter_spec(
        style={
            "title": "t",
            "axes": {"y": {"scale": "log"}, "x": {"reverse": True}},
        }
    )
    layout = compile_spec(spec)["layout"]
    assert layout["yaxis"]["type"] == "log"
    assert layout["xaxis"]["autorange"] == "reversed"


def test_transforms_filter_groupby_sort_limit_are_applied_in_order():
    spec = {
        "version": 1,
        "transforms": [
            {"op": "filter", "column": "group", "in": ["A"]},
            {"op": "groupby", "by": ["group"], "agg": {"score": "mean"}},
            {"op": "sort", "column": "score", "desc": True},
            {"op": "limit", "n": 1},
        ],
        "figure": {"chartType": "bar", "series": [{"x": "group", "y": "score"}]},
    }
    figure = compile_spec(spec)
    assert figure["data"][0]["x"] == ["A"]
    # mean of A scores (0.3, 0.2) == 0.25
    assert figure["data"][0]["y"] == [0.25]


def test_histogram_uses_only_x():
    spec = {"figure": {"chartType": "histogram", "series": [{"x": "score"}]}}
    figure = compile_spec(spec)
    assert figure["data"][0]["type"] == "histogram"
    assert len(figure["data"][0]["x"]) == 4


def test_box_requires_y_but_x_is_optional():
    spec = {"figure": {"chartType": "box", "series": [{"y": "score"}]}}
    figure = compile_spec(spec)
    assert figure["data"][0]["type"] == "box"


# --------------------------------------------------------------------------- #
# Validation errors
# --------------------------------------------------------------------------- #

def test_unknown_column_reports_path_and_message():
    spec = scatter_spec(
        figure={"chartType": "scatter", "series": [{"x": "time", "y": "scor"}]}
    )
    with pytest.raises(SpecValidationError) as excinfo:
        compile_spec(spec)
    errors = excinfo.value.errors
    assert {"path": "figure.series[0].y", "message": "unknown column 'scor'"} in errors


def test_missing_required_axis_reports_error():
    spec = {"figure": {"chartType": "scatter", "series": [{"x": "time"}]}}
    with pytest.raises(SpecValidationError) as excinfo:
        compile_spec(spec)
    paths = {err["path"] for err in excinfo.value.errors}
    assert "figure.series[0].y" in paths


def test_heatmap_forbids_color():
    spec = {
        "figure": {
            "chartType": "heatmap",
            "series": [{"x": "time", "y": "score", "color": "group"}],
        }
    }
    with pytest.raises(SpecValidationError) as excinfo:
        compile_spec(spec)
    paths = {err["path"] for err in excinfo.value.errors}
    assert "figure.series[0].color" in paths


def test_invalid_axis_range_is_rejected():
    spec = scatter_spec(
        style={"title": "t", "axes": {"x": {"range": [5, 1]}}}
    )
    with pytest.raises(SpecValidationError) as excinfo:
        compile_spec(spec)
    paths = {err["path"] for err in excinfo.value.errors}
    assert "style.axes.x.range" in paths


def test_legend_columns_reach_the_layout():
    spec = scatter_spec(
        style={"title": "t", "legend": {"orientation": "h", "columns": 2}}
    )
    legend = compile_spec(spec)["layout"]["legend"]
    assert legend["entrywidthmode"] == "fraction"
    assert legend["entrywidth"] == 0.5


def test_unknown_transform_column_is_rejected():
    spec = {
        "transforms": [{"op": "filter", "column": "nope", "in": ["A"]}],
        "figure": {"chartType": "scatter", "series": [{"x": "time", "y": "score"}]},
    }
    with pytest.raises(SpecValidationError) as excinfo:
        compile_spec(spec)
    paths = {err["path"] for err in excinfo.value.errors}
    assert "transforms[0].column" in paths
