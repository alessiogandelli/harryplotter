# FigureLab — Context

FigureLab is an AI-powered scientific figure editor: a three-panel web workspace
where a researcher loads a dataset, asks an LLM for a first figure, then refines
it with deterministic controls and exports it for publication.

## Glossary

- **FigureSpec** — the single reproducible document that describes a figure. It
  unifies three layers and is the unit of versioning and export. The AI produces
  and patches a FigureSpec; the UI edits it directly.
- **Data layer** (`dataset` + `transforms`) — the dataset reference (id +
  content hash) and the ordered, validated list of transformations applied to
  it (filter, groupby/aggregate, sort, limit). Statistical operations will be
  added here as future transform ops.
- **Figure layer** (`figure`) — what is plotted: the `chartType` and the series
  (which columns map to x, y and colour).
- **Style layer** (`style`) — how it looks: title, axes, legend, font, palette,
  marker/line, background, margins and figure size.
- **Compiler** — the pure function that turns a FigureSpec plus the loaded
  dataframe into a Plotly figure (a `{data, layout}` object). It performs
  semantic validation (columns exist, ranges valid, types coherent).
- **ChartProvider** — the interface behind which all model access sits
  (`generate`, `patch`). Implementations: `DecisionProvider` (OpenAI Decisions
  API), `StructuredProvider` (OpenAI Structured Outputs), `FakeProvider`
  (deterministic, used in tests).
- **Router** — decides whether a request targets a known primitive (fast
  Decisions path) or a novel chart type (Structured path).
- **Version** — a saved instance of a FigureSpec, retained for reproducibility.

## Domain rules

- The AI never generates executable code; it only produces or patches a
  FigureSpec.
- UI controls mutate the FigureSpec deterministically, with no LLM call.
- Refinement is a partial patch: it must change only the properties relevant to
  the request and preserve everything else.
- The OpenAI API key stays server-side only.

## Service layout

- `backend/` — FastAPI + pandas + Plotly + Pydantic + SQLite.
- `frontend/` — React + TypeScript + Vite + react-plotly.js, Zustand store, i18n.
- `docs/contract/` — the canonical FigureSpec schema and HTTP API contract that
  both sides implement against.

## Running

- Backend: `poetry install` then `poetry run uvicorn app.main:app --reload` in `backend/`.
- Frontend: `pnpm install` then `pnpm dev` in `frontend/`.
