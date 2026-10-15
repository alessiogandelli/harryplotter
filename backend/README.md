# FigureLab backend

FastAPI + pandas + Plotly + Pydantic + SQLite service implementing the FigureLab
HTTP API and the **FigureSpec** compiler. It turns a dataset plus a validated
FigureSpec into a Plotly figure, hosts the two-tier AI layer, and exports figures.

Contracts this service implements (source of truth):

- `../docs/contract/figure-spec.md`
- `../docs/contract/http-api.md`
- `../docs/contract/ai-providers.md`

## Requirements

- Python 3.12
- [Poetry](https://python-poetry.org/)

## Install

From this `backend/` directory:

```bash
poetry install
```

## Run

```bash
poetry run uvicorn app.main:app --reload
```

The service listens on `http://127.0.0.1:8000`. Health check:

```bash
curl http://127.0.0.1:8000/api/health   # {"status":"ok"}
```

## Test

```bash
poetry run pytest
```

Tests never touch the network: they run with `FIGURELAB_PROVIDER=fake`.

## Configuration

Settings come from environment variables. Instead of exporting them, copy
`../.env.example` to `../.env` (or `backend/.env`) and fill it in: the backend
loads `backend/.env` first, then the repo-root `.env`, and real environment
variables always win over both. `.env` is gitignored.

| Variable | Default | Meaning |
| --- | --- | --- |
| `FIGURELAB_PROVIDER` | `auto` | `auto` \| `fake` \| `decisions` \| `structured`. `auto` is `fake` when no key is set, otherwise the router picks per request. |
| `OPENAI_API_KEY` | _(unset)_ | Required for the real providers. Read server-side only and never returned in any response. |
| `FIGURELAB_CONFIDENCE_THRESHOLD` | `0.5` | Results below this are flagged to the UI (`belowThreshold`). |
| `FIGURELAB_DATA_DIR` | `backend/data` | Where datasets and the SQLite file live. |
| `FIGURELAB_DB_PATH` | `<data>/figurelab.sqlite` | SQLite metadata store. |
| `OPENAI_BASE_URL` | `https://api.openai.com` | Override for testing against a mock. |

## Layout

```
app/
  main.py           FastAPI app + HTTP API contract
  compiler.py       pure FigureSpec + DataFrame -> Plotly figure, with validation
  datasets.py       CSV/Excel ingestion, dtype detection, stats, sample
  db.py             SQLite metadata (datasets, projects, versions)
  export.py         HTML (always) and PNG/SVG/PDF (Kaleido when available)
  models/figure_spec.py   FigureSpec Pydantic models (contract v1)
  providers/        ChartProvider interface: fake, decisions, structured, router
tests/              compiler unit tests + HTTP API contract tests
```

## Notes

- The compiler is pure and never executes model-provided code; the AI only
  produces or patches a FigureSpec.
- Static export via Kaleido requires a headless Chrome; when it is missing the
  API responds `501 {"error":"export_unavailable","format":"..."}`. Interactive
  HTML export is always available.
