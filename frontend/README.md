# FigureLab — frontend

React + TypeScript + Vite single-page app for the FigureLab figure editor. It is
a three-panel workspace (Data · live Plotly preview · configuration + prompt bar)
built around a single **FigureSpec** document held in a Zustand store with
deterministic undo/redo.

## Requirements

- Node.js >= 20
- pnpm (`corepack enable` or `npm i -g pnpm`)

## Install

```bash
cd frontend
pnpm install
```

## Run (development)

```bash
pnpm dev
```

The dev server listens on <http://localhost:5173> and proxies `/api` to the
backend at <http://localhost:8000>. Start the backend (see `../backend`) first so
that upload, render, AI and export work.

## Checks

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
pnpm build       # tsc --noEmit && vite build
```

## Layout

```
src/
  api/            HTTP client for the endpoints in docs/contract/http-api.md
  types/          TypeScript mirrors of FigureSpec and the API responses
  store/          Zustand store (FigureSpec + past/future history) and pure reducers
  i18n/           react-i18next setup with English and Italian resources
  hooks/          debounced preview rendering
  components/     Data panel, preview, config sections, prompt bar, versions, export
```

## How it works

- The **FigureSpec** (see `../docs/contract/figure-spec.md`) is the single source
  of truth. Every control edits it locally — no network or LLM call — and each
  edit is pushed onto the history stack so undo/redo is deterministic.
- The **preview** is debounced and calls `POST /api/figures/render` with
  `{datasetId, spec}`; the returned `{data, layout}` is rendered with
  `react-plotly.js`.
- The **prompt bar** calls `POST /api/ai/generate` for the first figure and
  `POST /api/ai/patch` for refinements, and warns when the reported confidence is
  below the threshold.
- **Versions** create/list/duplicate/restore project versions via the API.
- **Export** buttons call `POST /api/export` and download the returned file.

The client never compiles a figure itself; the backend compiles the spec.
