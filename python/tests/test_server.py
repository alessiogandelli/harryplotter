import json
import threading
import urllib.request

from harryplotter import server


def test_serves_editor_and_handoff(tmp_path):
    csv = tmp_path / "data.csv"
    csv.write_text("a,b\n1,2\n3,4\n")
    key = server.register(server.Handoff("data", "data.csv", csv.read_bytes()))
    srv = server.serve(port=8790)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = server.url_for()

    assert b"Harry Plotter" in urllib.request.urlopen(base).read()
    info = json.load(urllib.request.urlopen(f"{base}api/initial?d={key}"))
    assert info["filename"] == "data.csv"
    assert urllib.request.urlopen(base + info["url"]).read() == csv.read_bytes()
    health = json.load(urllib.request.urlopen(base + "api/health"))
    assert health["ok"] is True
    srv.shutdown()


def test_ai_config_prefers_explicit_key(monkeypatch):
    monkeypatch.setenv("HARRYPLOTTER_API_KEY", "k")
    monkeypatch.setenv("HARRYPLOTTER_BASE_URL", "http://localhost:11434/v1/")
    monkeypatch.setenv("HARRYPLOTTER_MODEL", "qwen")
    cfg = server.AIConfig.from_env()
    assert (cfg.api_key, cfg.base_url, cfg.model) == ("k", "http://localhost:11434/v1", "qwen")


def test_cors_and_rate_limit(tmp_path):
    import urllib.error

    srv = server._server or server.serve(port=8790)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = server.url_for()
    server.Handler.allowed_origins = {"https://editor.example"}
    server.Handler.ai = server.AIConfig("k", "http://127.0.0.1:9/v1", "m")  # unreachable on purpose
    server.Handler.limit = server.RateLimit(1)

    def req(method, path, origin, body=None):
        r = urllib.request.Request(base + path, method=method, data=body,
                                   headers={"Origin": origin, "Content-Type": "application/json",
                                            "Access-Control-Request-Method": "POST"})
        try:
            with urllib.request.urlopen(r) as resp:
                return resp.status, dict(resp.headers)
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers)

    status, h = req("OPTIONS", "api/ai", "https://editor.example")
    assert status == 204 and h["Access-Control-Allow-Origin"] == "https://editor.example"
    status, h = req("OPTIONS", "api/ai", "https://evil.example")
    assert status == 403 and "Access-Control-Allow-Origin" not in h
    status, h = req("GET", "api/health", "https://editor.example")
    assert status == 200 and h["Access-Control-Allow-Origin"] == "https://editor.example"

    body = json.dumps({"messages": []}).encode()
    first, _ = req("POST", "api/ai", "https://editor.example", body)   # reaches the (dead) provider
    second, _ = req("POST", "api/ai", "https://editor.example", body)  # over the limit
    assert first == 502 and second == 429
    srv.shutdown()
