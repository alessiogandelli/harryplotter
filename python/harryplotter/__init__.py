"""Harry Plotter — publication-ready scientific figures in seconds.

From a notebook or script::

    import harryplotter as hp
    hp.plot(df)                 # opens the editor on a pandas DataFrame
    hp.plot("results.csv")      # or on a file

From a terminal::

    harryplotter results.csv
"""

from __future__ import annotations

import webbrowser
from pathlib import Path
from typing import Any

from .server import Handoff, register, serve, url_for

__all__ = ["plot", "__version__"]
__version__ = "0.1.0"


def _in_notebook() -> bool:
    try:
        from IPython import get_ipython  # type: ignore

        shell = get_ipython()
        return shell is not None and shell.__class__.__name__ == "ZMQInteractiveShell"
    except Exception:
        return False


def plot(data: Any, name: str | None = None, *, spec: dict | None = None, inline: bool | None = None,
         height: int = 760, port: int = 8765, open_browser: bool = True) -> str:
    """Open ``data`` in the Harry Plotter editor and return its URL.

    ``data`` can be a pandas DataFrame, a path to a CSV/TSV/Excel/JSON file, or a
    list of dicts. In Jupyter the editor is embedded in the cell (``inline=False``
    opens a browser tab instead).
    """
    if hasattr(data, "to_csv"):  # pandas (or anything DataFrame-like)
        df = data
        if getattr(df.index, "name", None) is not None or type(df.index).__name__ not in ("RangeIndex", "Index"):
            df = df.reset_index()
        handoff = Handoff(name or "dataframe", "data.csv", df.to_csv(index=False, date_format="%Y-%m-%d").encode())
    elif isinstance(data, (str, Path)):
        path = Path(data).expanduser()
        handoff = Handoff(name or path.stem, path.name, path.read_bytes())
    elif isinstance(data, list):
        import json

        handoff = Handoff(name or "data", "data.json", json.dumps(data, default=str).encode())
    else:
        raise TypeError("plot() accepts a DataFrame, a file path or a list of records")
    handoff.spec = spec

    serve(port, background=True)
    url = url_for(register(handoff))

    inline = _in_notebook() if inline is None else inline
    if inline:
        from IPython.display import HTML, display  # type: ignore

        display(HTML(
            f'<iframe src="{url}" style="width:100%;height:{height}px;border:1px solid #ddd;border-radius:8px"></iframe>'
            f'<div style="font:12px sans-serif;color:#777;margin-top:4px">Harry Plotter — <a href="{url}" target="_blank">open in a new tab</a></div>'
        ))
    elif open_browser:
        webbrowser.open(url)
    return url
