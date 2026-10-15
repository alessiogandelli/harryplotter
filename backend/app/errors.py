"""Domain-level exceptions mapped to HTTP responses in ``app.main``."""

from __future__ import annotations


class SpecValidationError(Exception):
    """Raised when a FigureSpec is invalid (schema or semantics)."""

    def __init__(self, errors: list[dict]):
        super().__init__("invalid figure spec")
        self.errors = errors


class ExportUnavailable(Exception):
    """Raised when a static export format has no available renderer."""

    def __init__(self, format: str):
        super().__init__(f"export format unavailable: {format}")
        self.format = format
