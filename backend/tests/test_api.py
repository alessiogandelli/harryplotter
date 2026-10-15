import hashlib


def base_spec(**overrides) -> dict:
    spec = {
        "version": 1,
        "figure": {"chartType": "scatter", "series": [{"x": "time", "y": "score"}]},
        "style": {"title": "score over time"},
    }
    spec.update(overrides)
    return spec


# --------------------------------------------------------------------------- #
# Health + datasets
# --------------------------------------------------------------------------- #

def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_upload_returns_schema_stats_and_sample(client, sample_csv, uploaded):
    assert uploaded["rows"] == 5
    assert uploaded["filename"] == "dataset.csv"
    expected_hash = "sha256:" + hashlib.sha256(sample_csv).hexdigest()
    assert uploaded["contentHash"] == expected_hash
    assert len(uploaded["sample"]) <= 20

    columns = {c["name"]: c for c in uploaded["columns"]}
    assert columns["time"]["dtype"] == "numeric"
    assert columns["group"]["dtype"] == "categorical"
    assert columns["active"]["dtype"] == "boolean"
    assert columns["score"]["missing"] == 1

    assert uploaded["stats"]["score"]["count"] == 4
    assert uploaded["stats"]["score"]["max"] == 0.9
    assert "group" not in uploaded["stats"]


def test_get_dataset_matches_upload(client, uploaded):
    fetched = client.get(f"/api/datasets/{uploaded['id']}").json()
    assert fetched == uploaded


def test_get_missing_dataset_is_a_structured_error(client):
    response = client.get("/api/datasets/nope")
    assert response.status_code == 404
    assert response.json()["error"] == "dataset_not_found"


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #

def test_render_returns_plotly_figure(client, uploaded):
    response = client.post(
        "/api/figures/render",
        json={"datasetId": uploaded["id"], "spec": base_spec()},
    )
    assert response.status_code == 200, response.text
    figure = response.json()["figure"]
    assert figure["data"][0]["x"] == [1, 2, 3, 4, 5]
    assert figure["layout"]["title"]["text"] == "score over time"


def test_render_invalid_spec_uses_contract_error_shape(client, uploaded):
    bad = base_spec(
        figure={"chartType": "scatter", "series": [{"x": "time", "y": "scor"}]}
    )
    response = client.post(
        "/api/figures/render",
        json={"datasetId": uploaded["id"], "spec": bad},
    )
    assert response.status_code == 422
    errors = response.json()["errors"]
    assert {"path": "figure.series[0].y", "message": "unknown column 'scor'"} in errors


def test_render_schema_invalid_spec_uses_contract_error_shape(client, uploaded):
    bad = {"version": 1, "figure": {"chartType": "not-a-chart", "series": []}}
    response = client.post(
        "/api/figures/render",
        json={"datasetId": uploaded["id"], "spec": bad},
    )
    assert response.status_code == 422
    assert "errors" in response.json()


# --------------------------------------------------------------------------- #
# AI (fake provider, no network)
# --------------------------------------------------------------------------- #

def test_ai_generate_returns_a_fake_spec(client, uploaded):
    response = client.post(
        "/api/ai/generate",
        json={"datasetId": uploaded["id"], "prompt": "scatter of score over time by group"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["provider"] == "fake"
    assert body["confidence"] is not None
    assert body["spec"]["figure"]["chartType"] == "scatter"
    assert body["spec"]["dataset"]["id"] == uploaded["id"]


def test_ai_generate_uses_distribution_chart_for_distribution_prompt(client, uploaded):
    body = client.post(
        "/api/ai/generate",
        json={"datasetId": uploaded["id"], "prompt": "show the distribution of score"},
    ).json()
    assert body["spec"]["figure"]["chartType"] in {"box", "histogram"}


def test_patch_changes_only_addressed_fields_and_preserves_the_rest(client, uploaded):
    current = base_spec(
        style={
            "title": "My Title",
            "axes": {"x": {"range": [0, 10]}},
            "marker": {"size": 12},
            "legend": {"position": "right", "orientation": "v"},
        }
    )
    response = client.post(
        "/api/ai/patch",
        json={
            "datasetId": uploaded["id"],
            "spec": current,
            "prompt": "put the legend on top in two rows",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    patched = body["spec"]

    # Addressed field changed.
    assert patched["style"]["legend"]["position"] == "top"
    assert patched["style"]["legend"]["columns"] == 2

    # Everything not addressed is preserved.
    assert patched["style"]["title"] == "My Title"
    assert patched["style"]["axes"]["x"]["range"] == [0, 10]
    assert patched["style"]["marker"]["size"] == 12
    assert patched["figure"]["chartType"] == "scatter"
    assert patched["figure"]["series"][0]["x"] == "time"
    assert patched["figure"]["series"][0]["y"] == "score"

    # The reported patch is partial: it mentions only the legend.
    assert body["patch"] == {
        "style": {"legend": {"position": "top", "columns": 2}}
    }


# --------------------------------------------------------------------------- #
# Versions
# --------------------------------------------------------------------------- #

def test_projects_versions_and_duplicate_roundtrip(client):
    project = client.post("/api/projects", json={"name": "My figure project"}).json()
    assert project["name"] == "My figure project"

    listed = client.get("/api/projects").json()["projects"]
    assert [p["id"] for p in listed] == [project["id"]]

    created = client.post(
        f"/api/projects/{project['id']}/versions",
        json={"name": "figure 3", "spec": base_spec()},
    ).json()
    assert created["name"] == "figure 3"
    assert created["projectId"] == project["id"]

    versions = client.get(f"/api/projects/{project['id']}/versions").json()["versions"]
    assert versions[0]["id"] == created["id"]

    fetched = client.get(f"/api/versions/{created['id']}").json()
    assert fetched["spec"]["figure"]["chartType"] == "scatter"

    duplicate = client.post(f"/api/versions/{created['id']}/duplicate").json()
    assert duplicate["id"] != created["id"]
    assert duplicate["spec"] == created["spec"]


def test_version_with_invalid_spec_is_rejected(client):
    project = client.post("/api/projects", json={"name": "p"}).json()
    bad = {"version": 1, "figure": {"chartType": "scatter", "series": [{"x": "nope", "y": "score"}]}}
    # Schema-valid but semantically unknown column is only caught at render time;
    # a schema-invalid spec must be rejected here.
    schema_bad = {"figure": {"chartType": "scatter"}}
    response = client.post(
        f"/api/projects/{project['id']}/versions",
        json={"name": "v", "spec": schema_bad},
    )
    assert response.status_code == 422
    assert "errors" in response.json()
    # sanity: the other spec is accepted at the schema level
    assert client.post(
        f"/api/projects/{project['id']}/versions",
        json={"name": "ok", "spec": bad},
    ).status_code == 200


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #

def test_export_html_is_self_contained(client, uploaded):
    response = client.post(
        "/api/export",
        json={"datasetId": uploaded["id"], "spec": base_spec(), "format": "html"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "attachment" in response.headers["content-disposition"]
    assert b"plotly" in response.content.lower()


def test_export_png_is_bytes_or_structured_501(client, uploaded):
    response = client.post(
        "/api/export",
        json={"datasetId": uploaded["id"], "spec": base_spec(), "format": "png"},
    )
    assert response.status_code in (200, 501)
    if response.status_code == 501:
        assert response.json() == {"error": "export_unavailable", "format": "png"}
    else:
        assert response.content[:8] == b"\x89PNG\r\n\x1a\n"


# --------------------------------------------------------------------------- #
# Safety
# --------------------------------------------------------------------------- #

def test_api_key_never_appears_in_responses(client, uploaded, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-secret-must-not-leak")
    monkeypatch.setenv("FIGURELAB_PROVIDER", "fake")
    response = client.post(
        "/api/ai/generate",
        json={"datasetId": uploaded["id"], "prompt": "scatter of score over time"},
    )
    assert "sk-secret-must-not-leak" not in response.text
