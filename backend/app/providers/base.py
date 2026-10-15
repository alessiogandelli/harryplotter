"""The ``ChartProvider`` interface and its result type."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ..models.figure_spec import FigureSpec


@dataclass
class ProviderResult:
    spec: FigureSpec
    provider: str
    confidence: Optional[float]
    patch: Optional[dict] = None

    def to_generate_response(self) -> dict:
        return {
            "spec": FigureSpec.model_dump(self.spec, mode="json", by_alias=True),
            "provider": self.provider,
            "confidence": self.confidence,
        }

    def to_patch_response(self) -> dict:
        return {
            "spec": FigureSpec.model_dump(self.spec, mode="json", by_alias=True),
            "patch": self.patch or {},
            "provider": self.provider,
            "confidence": self.confidence,
        }


class ChartProvider:
    """Interface: all model access sits behind this.

    ``dataset`` is the reduced dataset summary (columns, dtypes, stats, sample).
    """

    name = "provider"

    def generate(self, prompt: str, dataset: dict) -> ProviderResult:
        raise NotImplementedError

    def patch(self, prompt: str, spec: FigureSpec, dataset: dict) -> ProviderResult:
        raise NotImplementedError
