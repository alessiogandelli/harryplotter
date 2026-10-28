"""OpenAI Responses API provider with Structured Outputs (novel path).

Asks the model to emit a FigureSpec-shaped object constrained by the FigureSpec
JSON schema. The API key is used only for the outbound request and is never
echoed back to callers.
"""

from __future__ import annotations

import json
from typing import Optional

import httpx

from .. import config
from ..models.figure_spec import DatasetRef, FigureSpec, parse_figure_spec
from .base import ChartProvider, ProviderResult, SuggestionResult
from .schema import dataset_context

MODEL = "gpt-6-luna"

SYSTEM_PROMPT = """\
You are Harry Plotter, an expert scientific data-visualisation assistant. You \
turn a researcher's natural-language request into ONE JSON FigureSpec document. \
You never write code; you only emit the JSON object.

A FigureSpec has the shape:
{
  "version": 1,
  "transforms": [ ... ],          // optional, applied in order before plotting
  "figure": {
    "chartType": "scatter|line|bar|box|histogram|violin|heatmap|area",
    "series": [ { "x": "<column>", "y": "<column>", "color": "<column>", "name": "<label>" } ]
  },
  "style": {                       // optional; omit to accept clean defaults
    "title": "<human-readable title>",
    "subtitle": "<optional>",
    "axes": { "x": {"label": "..."}, "y": {"label": "..."} },
    "palette": "scientific|default|colorblind|grayscale"
  }
}

Column requirements by chart type (req = required, opt = optional, banned = must be absent):
- scatter, line, bar, area : x req, y req, color opt
- box, violin              : y req, x opt, color opt
- histogram                : x req, y banned, color opt
- heatmap                  : x req (columns), y req (cell value), color opt (becomes the row axis)

Rules:
- Use EXACT column names from the dataset; never invent or rename a column.
- To compare an aggregate across categories ("mean X by Y", "X per Y", "X vs Y"):
  add a groupby transform {"op":"groupby","by":["<category col>"],"agg":{"<numeric col>":"mean"}}
  and plot that category on x and the numeric column on y. Never leave raw
  per-row values when the request implies an aggregate.
- Setting series.color splits the data into one trace per category.
- Write a concise, human-readable style.title (no snake_case) and helpful axis labels.
- Keep style.palette "scientific" unless asked otherwise.
- Emit valid JSON only.

Intent guide:
- "trend", "over time", "evolution" -> line (or area for a filled trend)
- "distribution", "spread", "how is X distributed" -> histogram (single) or box/violin (by group)
- "correlation", "relationship", "association" -> scatter
- "compare", "ranking", "by category", "across groups" -> bar
- "matrix", "intensity across two categories", "heat" -> heatmap

Worked example:
Request: "average engagement by topic as a bar chart"
Dataset columns: topic (categorical), engagement (numeric)
Output: {"version": 1, "transforms": [{"op": "groupby", "by": ["topic"], "agg": {"engagement": "mean"}}], "figure": {"chartType": "bar", "series": [{"x": "topic", "y": "engagement"}]}, "style": {"title": "Average engagement by topic", "palette": "scientific"}}
"""

SUGGEST_SCHEMA = {
    "type": "object",
    "properties": {"prompt": {"type": "string"}},
    "required": ["prompt"],
    "additionalProperties": False,
}


class StructuredProvider(ChartProvider):
    name = "structured"

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        client: Optional[httpx.Client] = None,
    ):
        self._api_key = api_key or config.openai_api_key()
        if not self._api_key:
            raise RuntimeError("OPENAI_API_KEY is required for the structured provider")
        self._base_url = (base_url or config.openai_base_url()).rstrip("/")
        self._client = client

    def _respond(
        self,
        prompt: str,
        schema: Optional[dict] = None,
        name: str = "figurelab_output",
        instructions: Optional[str] = None,
        strict: bool = True,
    ) -> dict:
        if schema is None:
            text_format: dict = {"type": "json_object"}
        else:
            text_format = {
                "type": "json_schema",
                "name": name,
                "schema": schema,
                "strict": strict,
            }
        payload: dict = {
            "model": MODEL,
            "input": prompt,
            "text": {"format": text_format},
        }
        if instructions:
            payload["instructions"] = instructions
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        if self._client is not None:
            response = self._client.post(
                f"{self._base_url}/v1/responses", headers=headers, json=payload
            )
        else:
            response = httpx.post(
                f"{self._base_url}/v1/responses",
                headers=headers,
                json=payload,
                timeout=60.0,
            )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:300]
            raise RuntimeError(
                f"provider returned HTTP {exc.response.status_code}: {detail}"
            ) from exc
        except httpx.HTTPError as exc:  # network/timeout
            raise RuntimeError(f"provider request failed: {exc}") from exc
        return self._extract(response.json())

    @staticmethod
    def _extract(body: dict) -> dict:
        try:
            if isinstance(body.get("output_text"), str):
                return json.loads(body["output_text"])
            for item in body.get("output", []):
                for content in item.get("content", []):
                    if content.get("type") in ("output_text", "text"):
                        text = content.get("text")
                        if text:
                            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"provider returned invalid JSON: {exc}") from exc
        raise RuntimeError("no structured output returned by provider")

    def generate(self, prompt: str, dataset: dict) -> ProviderResult:
        schema = FigureSpec.model_json_schema()
        instruction = (
            f"Request: {prompt}\n\n"
            f"Dataset summary: {dataset_context(dataset)}"
        )
        # strict=False: the FigureSpec schema uses unions and dictionary-valued
        # fields (transforms) that OpenAI's strict mode rejects. The model still
        # receives the schema as a guide and the result is validated below.
        payload = self._respond(
            instruction, schema, instructions=SYSTEM_PROMPT, strict=False
        )
        spec = parse_figure_spec(payload)
        # The dataset reference is authoritative server-side; never trust the
        # model to echo it back correctly.
        spec.dataset = DatasetRef(
            id=str(dataset.get("id")), contentHash=str(dataset.get("contentHash"))
        )
        return ProviderResult(spec=spec, provider=self.name, confidence=None)

    def patch(self, prompt: str, spec: FigureSpec, dataset: dict) -> ProviderResult:
        from .patch import apply_patch
        from ..models.figure_spec import dump_figure_spec

        instruction = (
            "Return a PARTIAL FigureSpec patch as a JSON object. Include only the "
            "fields the request asks to change; omit everything else so the "
            "current figure is preserved.\n"
            f"Request: {prompt}\n"
            f"Current spec: {json.dumps(dump_figure_spec(spec))}\n"
            f"Dataset summary: {dataset_context(dataset)}"
        )
        # A partial patch has arbitrary nested keys, which strict schemas cannot
        # express, so use plain JSON mode here.
        payload = self._respond(instruction, None, instructions=SYSTEM_PROMPT)
        merged = apply_patch(dump_figure_spec(spec), payload)
        new_spec = parse_figure_spec(merged)
        return ProviderResult(
            spec=new_spec, provider=self.name, confidence=None, patch=payload
        )

    def suggest(self, dataset: dict) -> SuggestionResult:
        instruction = (
            "Given the dataset summary below, propose ONE short natural-language "
            "request for a genuinely useful, publication-quality chart. Name exact "
            "column names from the dataset and make the request specific about the "
            "aggregation and grouping.\n"
            f"Dataset summary: {dataset_context(dataset)}"
        )
        payload = self._respond(
            instruction,
            SUGGEST_SCHEMA,
            name="figurelab_suggestion",
            instructions=SYSTEM_PROMPT,
        )
        return SuggestionResult(
            prompt=str(payload.get("prompt", "")).strip(), provider=self.name
        )
