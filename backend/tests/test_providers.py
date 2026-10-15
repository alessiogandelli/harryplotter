from app.models.figure_spec import parse_figure_spec
from app.providers.decisions import DecisionProvider
from app.providers.fake import FakeProvider, choose_chart_type, explicit_chart_type
from app.providers.router import pick

DATASET = {
    "id": "ds-1",
    "contentHash": "sha256:abc",
    "rows": 4,
    "columns": [
        {"name": "time", "dtype": "numeric", "missing": 0},
        {"name": "score", "dtype": "numeric", "missing": 0},
        {"name": "group", "dtype": "categorical", "missing": 0},
    ],
    "stats": {},
    "sample": [],
}


def test_chart_type_keywords_are_deterministic():
    assert choose_chart_type("scatter of score over time") == "scatter"
    assert choose_chart_type("show the distribution") == "box"
    assert choose_chart_type("trend over time") == "line"
    assert choose_chart_type("bar chart of means") == "bar"
    assert choose_chart_type("a histogram please") == "histogram"


def test_fake_generate_builds_spec_from_schema():
    result = FakeProvider().generate("scatter of score over time by group", DATASET)
    spec = result.spec
    assert result.provider == "fake"
    assert result.confidence is not None
    assert spec.figure.chartType == "scatter"
    series = spec.figure.series[0]
    assert series.y == "score"
    assert series.color == "group"
    assert spec.dataset.id == "ds-1"


def test_fake_patch_returns_partial_patch_only():
    spec = parse_figure_spec(
        {
            "version": 1,
            "figure": {"chartType": "scatter", "series": [{"x": "time", "y": "score"}]},
            "style": {"title": "Keep me", "marker": {"size": 12}},
        }
    )
    result = FakeProvider().patch("move the legend to the bottom", spec, DATASET)
    assert result.patch == {"style": {"legend": {"position": "bottom"}}}
    assert result.spec.style.title == "Keep me"
    assert result.spec.style.marker.size == 12
    assert result.spec.style.legend.position == "bottom"


def test_router_keyword_heuristic():
    assert pick("scatter of score over time") == "known"
    assert pick("a violin plot of score") == "novel"
    assert pick("something completely different") == "known"


RICH = {
    "id": "ds-2",
    "contentHash": "sha256:z",
    "rows": 600,
    "columns": [
        {"name": "date", "dtype": "datetime", "missing": 0},
        {"name": "source", "dtype": "categorical", "missing": 0},
        {"name": "topic", "dtype": "categorical", "missing": 0},
        {"name": "polarization", "dtype": "categorical", "missing": 0},
        {"name": "sentiment", "dtype": "numeric", "missing": 0},
        {"name": "engagement", "dtype": "numeric", "missing": 0},
    ],
    "stats": {},
    "sample": [],
}


def test_explicit_chart_type_only_fires_on_named_types():
    assert explicit_chart_type("do a bar plot") == "bar"
    assert explicit_chart_type("make a histogram") == "histogram"
    assert explicit_chart_type("put the legend on top") is None


def test_generate_understands_measure_by_group():
    result = FakeProvider().generate("bar plot of engagement by topic", RICH)
    assert result.spec.figure.chartType == "bar"
    series = result.spec.figure.series[0]
    assert series.x == "topic"
    assert series.y == "engagement"


def test_generate_understands_measure_over_axis():
    result = FakeProvider().generate("line chart of sentiment over date", RICH)
    series = result.spec.figure.series[0]
    assert result.spec.figure.chartType == "line"
    assert series.x == "date"
    assert series.y == "sentiment"


def test_generate_distribution_by_group_makes_box():
    result = FakeProvider().generate(
        "show the distribution of sentiment by polarization", RICH
    )
    series = result.spec.figure.series[0]
    assert result.spec.figure.chartType == "box"
    assert series.x == "polarization"
    assert series.y == "sentiment"


def test_patch_can_change_the_chart_type():
    spec = parse_figure_spec(
        {
            "version": 1,
            "figure": {"chartType": "scatter", "series": [{"x": "date", "y": "sentiment"}]},
        }
    )
    result = FakeProvider().patch("make it a bar chart", spec, RICH)
    assert result.patch["figure"]["chartType"] == "bar"
    assert result.spec.figure.chartType == "bar"


def test_patch_without_chart_type_leaves_the_figure_untouched():
    spec = parse_figure_spec(
        {
            "version": 1,
            "figure": {"chartType": "scatter", "series": [{"x": "date", "y": "sentiment"}]},
        }
    )
    result = FakeProvider().patch("put the legend on top", spec, RICH)
    assert "figure" not in result.patch
    assert result.spec.figure.chartType == "scatter"


class _FakeResponse:
    def __init__(self, body: dict):
        self._body = body

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._body


class _FakeClient:
    def __init__(self, body: dict):
        self.body = body
        self.payload: dict | None = None

    def post(self, url: str, headers: dict | None = None, json: dict | None = None):
        self.payload = json
        return _FakeResponse(self.body)


def test_decisions_generate_maps_choice_answers_and_sends_context():
    body = {
        "answers": [
            {"type": "choice", "name": "chartType", "choice": "bar", "confidence": 0.9},
            {"type": "choice", "name": "x", "choice": "group", "confidence": 0.8},
            {"type": "choice", "name": "y", "choice": "score", "confidence": 0.8},
            {"type": "choice", "name": "color", "choice": "none", "confidence": 0.7},
            {"type": "score", "name": "confidence", "score": 1.5, "confidence": 0.6},
        ]
    }
    client = _FakeClient(body)
    provider = DecisionProvider(api_key="test", client=client)

    result = provider.generate("bar chart of score by group", DATASET)

    assert result.provider == "decisions"
    assert result.spec.figure.chartType == "bar"
    series = result.spec.figure.series[0]
    assert series.x == "group"
    assert series.y == "score"
    assert series.color is None
    # statistics and sample are part of the request input, not just the columns
    assert client.payload["model"] == "gpt-6-luna"
    assert "stats" in client.payload["input"]
    assert "sample" in client.payload["input"]
    assert client.payload["questions"][0]["name"] == "chartType"
