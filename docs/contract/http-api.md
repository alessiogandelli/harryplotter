# Contract: HTTP API (v1)

Local single-user service. Base path `/api`. JSON in/out except upload and file
export. The frontend implements exactly this contract.

## Datasets

### `POST /api/datasets`
Multipart upload (`file`). CSV or Excel (`.csv`, `.xlsx`, `.xls`).
Response `200`:
```jsonc
{
  "id": "uuid",
  "filename": "dataset.csv",
  "rows": 12450,
  "contentHash": "sha256:...",
  "kind": "upload",
  "columns": [
    { "name": "time",  "dtype": "numeric",  "missing": 0 },
    { "name": "score", "dtype": "numeric",  "missing": 12 },
    { "name": "group", "dtype": "categorical", "missing": 0 }
  ],
  "stats": {
    "score": { "count": 12438, "mean": 1.2, "std": 0.4, "min": 0, "max": 5 }
  },
  "sample": [ { "time": 1, "score": 0.3, "group": "A" } ]
}
```
`dtype` is one of `numeric | categorical | datetime | boolean`. `stats` is
present only for numeric columns. `sample` is at most 20 rows.

### `GET /api/datasets`
The dataset library, newest first. Bundled samples from the `samples/` directory
are seeded here on startup (tagged `kind: "sample"`); uploads persist and appear
here too (`kind: "upload"`).
```jsonc
{
  "datasets": [
    { "id": "uuid", "filename": "dataset.csv", "rows": 600,
      "columnCount": 8, "contentHash": "sha256:...",
      "kind": "upload", "createdAt": "2026-..." }
  ]
}
```

### `GET /api/datasets/{id}`
Same response as upload, without re-uploading.

## Rendering

### `POST /api/figures/render`
```jsonc
{ "datasetId": "uuid", "spec": { /* FigureSpec */ } }
```
Response `200`:
```jsonc
{ "figure": { "data": [ /* plotly traces */ ], "layout": { /* plotly layout */ } } }
```
Response `422` on invalid spec, with a JSON body:
```jsonc
{ "errors": [ { "path": "figure.series[0].y", "message": "unknown column 'scor'" } ] }
```

## AI

### `POST /api/ai/generate`
```jsonc
{ "datasetId": "uuid", "prompt": "scatter of score over time by group" }
```
Response `200`:
```jsonc
{
  "spec": { /* FigureSpec */ },
  "provider": "decisions" | "structured" | "fake",
  "confidence": 0.93
}
```
`confidence` may be `null` when the provider does not report one. A confidence
below the server threshold is surfaced so the UI can warn the user.

### `POST /api/ai/patch`
```jsonc
{ "datasetId": "uuid", "spec": { /* current FigureSpec */ }, "prompt": "put the legend on top in two rows" }
```
Response `200`:
```jsonc
{
  "spec": { /* FigureSpec with the patch applied */ },
  "patch": { /* the partial patch that was applied */ },
  "provider": "decisions" | "structured" | "fake",
  "confidence": 0.88
}
```
The patch must be *partial*: fields not addressed by the prompt are preserved.

### `GET /api/ai/status`
```jsonc
{ "llmAvailable": true, "provider": "structured" }
```
`llmAvailable` is `false` when no `OPENAI_API_KEY` is configured. The UI uses it
to enable/disable the LLM-backed "Suggest" button.

### `POST /api/ai/suggest`
```jsonc
{ "datasetId": "uuid" }
```
→ `{ "prompt": "bar plot of engagement by topic", "provider": "structured" }`

Proposes one natural-language chart request for the dataset. Requires an LLM
(free text is only produced by the Structured provider); without a key it
responds `503 { "error": "llm_unavailable" }`.

## Versions

### `POST /api/projects`
```jsonc
{ "name": "My figure project" }
```
→ `{ "id": "uuid", "name": "...", "createdAt": "..." }`

### `GET /api/projects`
→ `{ "projects": [ { "id", "name", "createdAt" } ] }`

### `POST /api/projects/{projectId}/versions`
```jsonc
{ "name": "figure 3", "spec": { /* FigureSpec */ } }
```
→ `{ "id": "uuid", "projectId": "...", "name": "figure 3", "createdAt": "...", "spec": { ... } }`

### `GET /api/projects/{projectId}/versions`
→ `{ "versions": [ { "id", "name", "createdAt", "spec" } ] }`

### `GET /api/versions/{id}`
→ `{ "id", "projectId", "name", "createdAt", "spec" }`

### `POST /api/versions/{id}/duplicate`
→ the new version object.

## Export

### `POST /api/export`
```jsonc
{
  "datasetId": "uuid",
  "spec": { /* FigureSpec */ },
  "format": "html" | "png" | "svg" | "pdf",
  "width": 1200, "height": 800, "scale": 2
}
```
Response `200` is the file as bytes with a `Content-Disposition: attachment`
header. `width`/`height`/`scale` override `style.size` for the export only.
If a format's renderer is unavailable (e.g. Kaleido/Chrome missing), respond
`501` with `{ "error": "export_unavailable", "format": "pdf" }`.

## Errors

All errors are JSON: `{ "error": "<code>", "message": "<human readable>" }`.
Validation errors use `{ "errors": [ { "path", "message" } ] }` (HTTP 422).

## Health

### `GET /api/health` → `{ "status": "ok" }`
