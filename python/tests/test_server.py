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
