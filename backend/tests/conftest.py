import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import create_app  # noqa: E402

SAMPLE_CSV = (
    "time,score,group,active\n"
    "1,0.3,A,true\n"
    "2,0.5,B,false\n"
    "3,,A,true\n"
    "4,0.9,B,true\n"
    "5,0.1,A,false\n"
).encode("utf-8")


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FIGURELAB_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("FIGURELAB_DB_PATH", str(tmp_path / "figurelab.sqlite"))
    monkeypatch.setenv("FIGURELAB_PROVIDER", "fake")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def sample_csv() -> bytes:
    return SAMPLE_CSV


@pytest.fixture()
def uploaded(client, sample_csv) -> dict:
    response = client.post(
        "/api/datasets",
        files={"file": ("dataset.csv", sample_csv, "text/csv")},
    )
    assert response.status_code == 200, response.text
    return response.json()
