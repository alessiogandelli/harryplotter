"""Provider selection from the environment."""

from __future__ import annotations

from typing import Optional

from .. import config
from ..models.figure_spec import FigureSpec
from .base import ChartProvider, ProviderResult, SuggestionResult
from .decisions import DecisionProvider
from .fake import FakeProvider
from .router import is_simple_refinement
from .structured import StructuredProvider


class RouterProvider(ChartProvider):
    """Chooses the best provider per request.

    Full figure creation always goes to the LLM (Structured), which can express
    the whole spec. Small closed-vocabulary refinements use the fast Decisions
    path. Either path falls back to the other so a request never hard-fails if a
    provider is momentarily unavailable.
    """

    name = "auto"

    def __init__(self, decisions: ChartProvider, structured: ChartProvider):
        self._decisions = decisions
        self._structured = structured

    def generate(self, prompt: str, dataset: dict) -> ProviderResult:
        try:
            return self._structured.generate(prompt, dataset)
        except RuntimeError:
            return self._decisions.generate(prompt, dataset)

    def polish(self, spec: FigureSpec, dataset: dict) -> ProviderResult:
        return self._decisions.polish(spec, dataset)

    def patch(self, prompt: str, spec: FigureSpec, dataset: dict) -> ProviderResult:
        if is_simple_refinement(prompt):
            try:
                return self._decisions.patch(prompt, spec, dataset)
            except RuntimeError:
                return self._structured.patch(prompt, spec, dataset)
        return self._structured.patch(prompt, spec, dataset)

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
