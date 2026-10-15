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
from ..models.figure_spec import FigureSpec, parse_figure_spec
from .base import ChartProvider, ProviderResult
from .schema import dataset_context

MODEL = "gpt-6-luna"

PATCH_SCHEMA = {
    "type": "object",
    "properties": {
        "style": {"type": "object"},
        "figure": {"type": "object"},
        "transforms": {"type": "array"},
    },
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

    def _respond(self, prompt: str, schema: dict) -> dict:
        payload = {
            "model": MODEL,
            "input": prompt,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "figurelab_output",
                    "schema": schema,
                    "strict": True,
                }
            },
        }
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
        response.raise_for_status()
        return self._extract(response.json())

    @staticmethod
    def _extract(body: dict) -> dict:
        if isinstance(body.get("output_text"), str):
            return json.loads(body["output_text"])
        for item in body.get("output", []):
            for content in item.get("content", []):
                if content.get("type") in ("output_text", "text"):
                    text = content.get("text")
                    if text:
                        return json.loads(text)
        raise RuntimeError("no structured output returned by provider")

    def generate(self, prompt: str, dataset: dict) -> ProviderResult:
        schema = FigureSpec.model_json_schema()
        instruction = (
            "Produce a FigureSpec JSON document for this request.\n"
            f"Request: {prompt}\n"
            f"Dataset summary: {dataset_context(dataset)}\n"
            f"Dataset id: {dataset.get('id')} contentHash: {dataset.get('contentHash')}"
        )
        payload = self._respond(instruction, schema)
        spec = parse_figure_spec(payload)
        return ProviderResult(spec=spec, provider=self.name, confidence=None)

    def patch(self, prompt: str, spec: FigureSpec, dataset: dict) -> ProviderResult:
        from .patch import apply_patch
        from ..models.figure_spec import dump_figure_spec

        instruction = (
            "Return a partial FigureSpec patch (only the fields addressed by the "
            "request) as JSON.\n"
            f"Request: {prompt}\n"
            f"Current spec: {json.dumps(dump_figure_spec(spec))}"
        )
        payload = self._respond(instruction, PATCH_SCHEMA)
        merged = apply_patch(dump_figure_spec(spec), payload)
        new_spec = parse_figure_spec(merged)
        return ProviderResult(
            spec=new_spec, provider=self.name, confidence=None, patch=payload
        )
