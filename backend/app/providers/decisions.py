"""OpenAI Decisions API provider (fast path, model ``gpt-6-luna``).

Builds ``choice``/``score`` questions whose options are derived from the dataset
schema and maps the typed answers onto FigureSpec fields. The dataset summary
(schema + statistics + a small sample) is sent as the request ``input``. Network
is only ever reached when this provider is selected and a key is set.
"""

from __future__ import annotations

import json
from typing import Any, Optional

import httpx

from .. import config
from ..models.figure_spec import FigureSpec, dump_figure_spec, parse_figure_spec
from .base import ChartProvider, ProviderResult
from .patch import apply_patch
from .schema import column_names, dataset_context
from .template import TUNABLE_FIELDS, coerce_recommended, get_path, set_path

MODEL = "gpt-6-luna"
PRIMITIVE_CHARTS = ["scatter", "line", "bar", "box", "histogram"]
CHART_DESCRIPTIONS = {
    "scatter": "relationship between two numeric variables",
    "line": "trend of a value over an ordered variable such as time",
    "bar": "compare an aggregated value across categories",
    "box": "distribution of a numeric value, optionally per group",
    "histogram": "distribution of a single numeric variable",
}


class DecisionProvider(ChartProvider):
    name = "decisions"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        client: Optional[httpx.Client] = None,
    ):
        self._api_key = api_key or config.openai_api_key()
        if not self._api_key:
            raise RuntimeError("OPENAI_API_KEY is required for the decisions provider")
        self._base_url = (base_url or config.openai_base_url()).rstrip("/")
        self._client = client

    # -- transport -------------------------------------------------------- #

    def _ask(self, context: str, questions: list[dict]) -> dict:
        payload = {"model": MODEL, "input": context, "questions": questions}
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        if self._client is not None:
            response = self._client.post(
                f"{self._base_url}/v1/decisions", headers=headers, json=payload
            )
        else:
            response = httpx.post(
                f"{self._base_url}/v1/decisions",
                headers=headers,
                json=payload,
                timeout=30.0,
            )
        response.raise_for_status()
        return response.json()

    @staticmethod
    def _answer(body: dict, name: str) -> tuple[Any, Optional[float]]:
        answers = body.get("answers", [])
        if isinstance(answers, dict):  # tolerate a mapping response shape
            answers = [{"name": k, **(v if isinstance(v, dict) else {"choice": v})}
                       for k, v in answers.items()]
        for answer in answers:
            if answer.get("name") != name:
                continue
            if answer.get("type") == "refusal":
                return None, None
            if "choice" in answer:
                return answer.get("choice"), answer.get("confidence")
            if "score" in answer:
                return answer.get("score"), answer.get("confidence")
            if "probability" in answer:
                return answer.get("probability"), answer.get("confidence")
        return None, None

    @staticmethod
    def _choices(values: list[str], descriptions: Optional[dict] = None) -> list[dict]:
        return [
            {"value": value, "description": (descriptions or {}).get(value, value)}
            for value in values
        ]

    # -- ChartProvider ---------------------------------------------------- #

    def generate(self, prompt: str, dataset: dict) -> ProviderResult:
        numeric = column_names(dataset, "numeric")
        categorical = column_names(dataset, "categorical") + column_names(dataset, "boolean")
        all_cols = column_names(dataset)
        context = (
            f"User request: {prompt}\n"
            f"Dataset summary: {dataset_context(dataset)}"
        )

        questions = [
            {
                "name": "chartType",
                "type": "choice",
                "instructions": "Which primitive chart type best matches the request?",
                "choices": self._choices(PRIMITIVE_CHARTS, CHART_DESCRIPTIONS),
            },
            {
                "name": "x",
                "type": "choice",
                "instructions": "Which column should be on the x axis?",
                "choices": self._choices(all_cols or ["none"]),
            },
            {
                "name": "y",
                "type": "choice",
                "instructions": "Which column should be on the y axis?",
                "choices": self._choices(numeric or all_cols or ["none"]),
            },
            {
                "name": "color",
                "type": "choice",
                "instructions": "Which column, if any, should provide colour?",
                "choices": self._choices(["none"] + categorical),
            },
            {
                "name": "confidence",
                "type": "score",
                "instructions": "How confident are you in this figure?",
                "levels": [{"label": "low"}, {"label": "medium"}, {"label": "high"}],
            },
        ]
        body = self._ask(context, questions)

        chart, chart_conf = self._answer(body, "chartType")
        x, x_conf = self._answer(body, "x")
        y, y_conf = self._answer(body, "y")
        color, _ = self._answer(body, "color")
        _, score_conf = self._answer(body, "confidence")

        if chart not in PRIMITIVE_CHARTS:
            chart = "scatter"
        series: dict = {}
        if x and x in all_cols:
            series["x"] = x
        if y and y in all_cols:
            series["y"] = y
        if color and color != "none" and color in all_cols:
            series["color"] = color

        spec_dict = {
            "version": 1,
            "dataset": {"id": dataset.get("id"), "contentHash": dataset.get("contentHash")},
            "transforms": [],
            "figure": {"chartType": chart, "series": [series]},
            "style": {"title": f"{series.get('y', 'value')} over {series.get('x', 'category')}"},
            "meta": {"modelVersion": MODEL},
        }
        confidence = body.get("confidence")
        if confidence is None:
            candidates = [c for c in (chart_conf, x_conf, y_conf, score_conf) if c is not None]
            confidence = min(candidates) if candidates else None
        spec = parse_figure_spec(spec_dict)
        return ProviderResult(spec=spec, provider=self.name, confidence=confidence)

    def patch(self, prompt: str, spec: FigureSpec, dataset: dict) -> ProviderResult:
        keep = "keep"
        context = (
            f"User refinement request: {prompt}\n"
            f"Current figure spec: {dump_figure_spec(spec)}\n"
            f"Dataset summary: {dataset_context(dataset)}"
        )
        questions = [
            {
                "name": "legendPosition",
                "type": "choice",
                "instructions": "Where should the legend go?",
                "choices": self._choices(
                    [keep, "top", "bottom", "left", "right", "hide"]
                ),
            },
            {
                "name": "legendOrientation",
                "type": "choice",
                "instructions": "Legend orientation?",
                "choices": self._choices([keep, "h", "v"]),
            },
            {
                "name": "palette",
                "type": "choice",
                "instructions": "Which palette?",
                "choices": self._choices(
                    [keep, "default", "scientific", "colorblind", "grayscale"]
                ),
            },
            {
                "name": "axisScale",
                "type": "choice",
                "instructions": "Axis scale?",
                "choices": self._choices([keep, "linear", "log"]),
            },
            {
                "name": "confidence",
                "type": "score",
                "instructions": "How confident are you in this refinement?",
                "levels": [{"label": "low"}, {"label": "medium"}, {"label": "high"}],
            },
        ]
        body = self._ask(context, questions)

        style: dict = {}
        legend: dict = {}

        position, _ = self._answer(body, "legendPosition")
        if position == "hide":
            legend["show"] = False
        elif position in ("top", "bottom", "left", "right"):
            legend["position"] = position

        orientation, _ = self._answer(body, "legendOrientation")
        if orientation in ("h", "v"):
            legend["orientation"] = orientation

        palette, _ = self._answer(body, "palette")
        if palette in ("default", "scientific", "colorblind", "grayscale"):
            style["palette"] = palette

        scale, _ = self._answer(body, "axisScale")
        if scale in ("linear", "log"):
            style["axes"] = {"y": {"scale": scale}}

        if legend:
            style["legend"] = legend

        patch = {"style": style} if style else {}
        merged = apply_patch(dump_figure_spec(spec), patch)
        new_spec = parse_figure_spec(merged)
        confidence = body.get("confidence")
        return ProviderResult(
            spec=new_spec, provider=self.name, confidence=confidence, patch=patch
        )

    def polish(self, spec: FigureSpec, dataset: dict) -> ProviderResult:
        """Two-pass quality pass towards the template.

        Pass 1 (one Decisions call, predicates): which fields should change?
        Pass 2 (one Decisions call, choices): what should each flagged field
        become? The result is a partial patch, so anything untouched is kept.
        """
        current = dump_figure_spec(spec)
        fields = [f for f in TUNABLE_FIELDS if get_path(current, f["path"]) is not None]
        if not fields:
            return ProviderResult(spec=spec, provider=self.name, confidence=None, patch={})

        context = (
            "Goal: a clean, publication-quality scientific figure.\n"
            f"Current figure spec: {json.dumps(current)}\n"
            f"Dataset summary: {dataset_context(dataset)}"
        )

        pass1 = [
            {
                "name": field["key"],
                "type": "predicate",
                "instructions": (
                    f"Should the {field['label']} change from its current value "
                    f"({get_path(current, field['path'])!r}) to better match a "
                    "polished scientific figure? Answer yes only if it clearly improves it."
                ),
            }
            for field in fields
        ]
        body1 = self._ask(context, pass1)
        flagged = [
            field
            for field in fields
            if (self._answer(body1, field["key"])[0] or 0.0) >= 0.5
        ]
        if not flagged:
            return ProviderResult(spec=spec, provider=self.name, confidence=None, patch={})

        pass2 = [
            {
                "name": field["key"],
                "type": "choice",
                "instructions": f"Which {field['label']} should be used?",
                "choices": [
                    {"value": value, "description": description}
                    for value, description in field["options"]
                ],
            }
            for field in flagged
        ]
        body2 = self._ask(context, pass2)

        patch: dict = {}
        for field in flagged:
            chosen, _ = self._answer(body2, field["key"])
            valid = {value for value, _ in field["options"]}
            if chosen not in valid:
                continue
            set_path(
                patch, field["path"], coerce_recommended(chosen, field["recommended"])
            )

        if not patch:
            return ProviderResult(spec=spec, provider=self.name, confidence=None, patch={})
        merged = apply_patch(current, patch)
        new_spec = parse_figure_spec(merged)
        return ProviderResult(
            spec=new_spec, provider=self.name, confidence=None, patch=patch
        )
