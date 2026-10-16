"""Provider selection from the environment."""

from __future__ import annotations

from typing import Optional

from .. import config
from ..models.figure_spec import FigureSpec
from .base import ChartProvider, ProviderResult, SuggestionResult
from .decisions import DecisionProvider
from .fake import FakeProvider
from .router import pick
from .structured import StructuredProvider


class RouterProvider(ChartProvider):
    """Routes each request to the known or novel path."""

    name = "auto"

    def __init__(self, decisions: ChartProvider, structured: ChartProvider):
        self._decisions = decisions
        self._structured = structured

    def generate(self, prompt: str, dataset: dict) -> ProviderResult:
        if pick(prompt, dataset) == "novel":
            base = self._structured.generate(prompt, dataset)
        else:
            base = self._decisions.generate(prompt, dataset)
        # Upgrade the fresh figure towards the quality template. Best-effort: if
        # the polish pass fails, the base figure is still returned.
        try:
            polished = self._decisions.polish(base.spec, dataset)
        except Exception:  # noqa: BLE001 - polish must never break generation
            return base
        return ProviderResult(
            spec=polished.spec,
            provider=base.provider,
            confidence=base.confidence,
            patch=base.patch,
        )

    def polish(self, spec: FigureSpec, dataset: dict) -> ProviderResult:
        return self._decisions.polish(spec, dataset)

    def patch(self, prompt: str, spec: FigureSpec, dataset: dict) -> ProviderResult:
        if pick(prompt, dataset) == "novel":
            return self._structured.patch(prompt, spec, dataset)
        return self._decisions.patch(prompt, spec, dataset)

    def suggest(self, dataset: dict) -> SuggestionResult:
        # A written suggestion needs free text, which only Structured can emit.
        return self._structured.suggest(dataset)


def build_provider(name: Optional[str] = None) -> ChartProvider:
    mode = (name or config.provider_mode()).lower()
    key = config.openai_api_key()

    if mode == "fake":
        return FakeProvider()
    if mode == "decisions":
        return DecisionProvider() if key else FakeProvider()
    if mode == "structured":
        return StructuredProvider() if key else FakeProvider()

    # auto: fake without a key, otherwise route per request
    if not key:
        return FakeProvider()
    return RouterProvider(DecisionProvider(), StructuredProvider())
