"""Local server for Harry Plotter.

Serves the editor, hands it the file (or DataFrame) to open, and proxies AI
requests so the API key never reaches the browser. Standard library only.

    harryplotter data.csv            # open a file
    harryplotter                     # open the editor empty
    harryplotter --port 9000 --no-browser
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import threading
import urllib.error
import urllib.request
import uuid
import webbrowser
from dataclasses import dataclass
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

STATIC = Path(__file__).resolve().parent / "static"
DEFAULT_PORT = 8765


# ---------------------------------------------------------------- AI config


@dataclass
class AIConfig:
    api_key: str
    base_url: str
    model: str

    @classmethod
    def from_env(cls) -> "AIConfig":
        key = os.environ.get("HARRYPLOTTER_API_KEY") or ""
        base = os.environ.get("HARRYPLOTTER_BASE_URL") or ""
        if not key and os.environ.get("OPENROUTER_API_KEY"):
            key, base = os.environ["OPENROUTER_API_KEY"], base or "https://openrouter.ai/api/v1"
        if not key and os.environ.get("OPENAI_API_KEY"):
            key, base = os.environ["OPENAI_API_KEY"], base or "https://api.openai.com/v1"
        base = base or "https://openrouter.ai/api/v1"
        default_model = "gpt-4.1-mini" if "api.openai.com" in base else "openai/gpt-4.1-mini"
        return cls(key, base.rstrip("/"), os.environ.get("HARRYPLOTTER_MODEL") or default_model)

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)


def complete(cfg: AIConfig, messages: list) -> str:
    body = json.dumps({
        "model": cfg.model,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }).encode()
    req = urllib.request.Request(
        f"{cfg.base_url}/chat/completions",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg.api_key}",
            "HTTP-Referer": "https://github.com/alessiogandelli/harryplotter",
            "X-Title": "Harry Plotter",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.load(r)
    return data["choices"][0]["message"]["content"]


# ---------------------------------------------------------------- files handed to the editor


@dataclass
class Handoff:
    name: str
    filename: str
    content: bytes
    spec: dict | None = None


_handoffs: dict[str, Handoff] = {}
_latest: str | None = None


def register(handoff: Handoff) -> str:
    global _latest
    key = uuid.uuid4().hex[:10]
    _handoffs[key] = handoff
    _latest = key
    return key


# ---------------------------------------------------------------- HTTP


class Handler(SimpleHTTPRequestHandler):
    ai: AIConfig = AIConfig("", "", "")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def log_message(self, fmt, *args):  # keep the terminal quiet
        if os.environ.get("HARRYPLOTTER_DEBUG"):
            super().log_message(fmt, *args)

    def _json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/health":
            return self._json({"ok": True, "ai": self.ai.enabled, "model": self.ai.model if self.ai.enabled else None})
        if url.path == "/api/initial":
            key = parse_qs(url.query).get("d", [""])[0] or _latest
            h = _handoffs.get(key or "")
            if not h:
                return self._json({})
            return self._json({"name": h.name, "filename": h.filename, "url": f"api/file/{key}", "spec": h.spec})
        if url.path.startswith("/api/file/"):
            h = _handoffs.get(url.path.rsplit("/", 1)[-1])
            if not h:
                return self._json({"error": "not found"}, 404)
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(h.filename)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(h.content)))
            self.end_headers()
            self.wfile.write(h.content)
            return None
        return super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/ai":
            return self._json({"error": "not found"}, 404)
        if not self.ai.enabled:
            return self._json({"error": "No API key configured on the server (set OPENROUTER_API_KEY or OPENAI_API_KEY)."}, 400)
        try:
            length = int(self.headers.get("Content-Length", 0))
            messages = json.loads(self.rfile.read(length))["messages"]
            return self._json({"content": complete(self.ai, messages)})
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:300]
            return self._json({"error": f"AI provider error {e.code}: {detail}"}, 502)
        except Exception as e:  # network, timeout, malformed answer
            return self._json({"error": f"AI request failed: {e}"}, 502)


_server: ThreadingHTTPServer | None = None


def serve(port: int = DEFAULT_PORT, host: str = "127.0.0.1", background: bool = False) -> ThreadingHTTPServer:
    """Start the server once per process; later calls reuse it."""
    global _server
    if _server is not None:
        return _server
    if not (STATIC / "index.html").exists():
        raise RuntimeError("The editor is not built. Run `npm run build` in web/ first.")
    Handler.ai = AIConfig.from_env()
    for p in range(port, port + 20):
        try:
            _server = ThreadingHTTPServer((host, p), Handler)
            break
        except OSError:
            continue
    else:
        raise RuntimeError(f"No free port between {port} and {port + 19}")
    if background:
        threading.Thread(target=_server.serve_forever, daemon=True).start()
    return _server


def url_for(key: str | None = None) -> str:
    assert _server is not None
    host, port = _server.server_address[:2]
    return f"http://{host}:{port}/" + (f"?d={key}" if key else "")


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="harryplotter", description="Publication-ready figures in seconds.")
    ap.add_argument("file", nargs="?", help="CSV, TSV, Excel or JSON file to open")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args(argv)

    key = None
    if args.file:
        path = Path(args.file).expanduser()
        if not path.exists():
            ap.error(f"{path} does not exist")
        key = register(Handoff(path.stem, path.name, path.read_bytes()))

    server = serve(args.port, args.host)
    url = url_for(key)
    ai = Handler.ai
    print(f"\n  Harry Plotter  →  {url}")
    print(f"  AI: {'on (' + ai.model + ')' if ai.enabled else 'off — set OPENROUTER_API_KEY or OPENAI_API_KEY to enable'}")
    print("  Ctrl+C to stop\n")
    if not args.no_browser:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  bye")


if __name__ == "__main__":
    main()
