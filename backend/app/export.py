"""Figure export: interactive HTML always; PNG/SVG/PDF via Kaleido when present."""

from __future__ import annotations

import pandas as pd

from .compiler import compile_plotly
from .errors import ExportUnavailable
from .models.figure_spec import FigureSpec

MEDIA_TYPES = {
    "html": "text/html",
    "png": "image/png",
    "svg": "image/svg+xml",
    "pdf": "application/pdf",
}

STATIC_FORMATS = {"png", "svg", "pdf"}


def export_figure(
    spec: FigureSpec,
    df: pd.DataFrame,
    format: str = "html",
    width: float | None = None,
    height: float | None = None,
    scale: float | None = None,
) -> tuple[bytes, str, str]:
    """Return ``(content, media_type, filename)`` for the requested format."""
    fmt = (format or "html").lower()
    if fmt not in MEDIA_TYPES:
        raise ExportUnavailable(fmt)

    figure = compile_plotly(spec, df)

    # Export-only size overrides.
    if width is not None:
        figure.layout.width = width
    if height is not None:
        figure.layout.height = height

    if fmt == "html":
        html = figure.to_html(include_plotlyjs=True, full_html=True)
        return html.encode("utf-8"), MEDIA_TYPES[fmt], "figure.html"

    try:
        image = figure.to_image(
            format=fmt,
            width=int(figure.layout.width) if figure.layout.width else None,
            height=int(figure.layout.height) if figure.layout.height else None,
            scale=scale if scale is not None else 1,
        )
    except Exception as exc:  # noqa: BLE001 - any renderer failure -> 501
        raise ExportUnavailable(fmt) from exc

    return bytes(image), MEDIA_TYPES[fmt], f"figure.{fmt}"
