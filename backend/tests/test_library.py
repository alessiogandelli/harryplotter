from app import datasets


def test_library_is_empty_without_samples(client) -> None:
    response = client.get("/api/datasets")
    assert response.status_code == 200
    assert response.json() == {"datasets": []}


def test_uploaded_dataset_appears_in_library(client, sample_csv) -> None:
    uploaded = client.post(
        "/api/datasets", files={"file": ("d.csv", sample_csv, "text/csv")}
    ).json()

    listing = client.get("/api/datasets").json()["datasets"]

    assert len(listing) == 1
    entry = listing[0]
    assert entry["id"] == uploaded["id"]
    assert entry["filename"] == "d.csv"
    assert entry["kind"] == "upload"
    assert entry["columnCount"] == len(uploaded["columns"])
    assert entry["rows"] == uploaded["rows"]


def test_seed_samples_is_idempotent_and_tagged(client, tmp_path, monkeypatch) -> None:
    samples = tmp_path / "samples"
    samples.mkdir()
    (samples / "demo.csv").write_bytes(b"time,score\n1,0.5\n2,0.6\n")
    monkeypatch.setenv("FIGURELAB_SAMPLES_DIR", str(samples))

    assert len(datasets.seed_samples()) == 1
    # second run finds the content hash already present and adds nothing
    assert datasets.seed_samples() == []

    listing = client.get("/api/datasets").json()["datasets"]
    assert [entry["kind"] for entry in listing] == ["sample"]
    assert listing[0]["filename"] == "demo.csv"
