# Contract: AI providers

All model access sits behind one interface so the rest of the system never
depends on a specific OpenAI API. Backend-only; the frontend only sees the HTTP
responses from `docs/contract/http-api.md`.

## Interface

```text
ChartProvider.generate(prompt, dataset) -> ProviderResult
ChartProvider.patch(prompt, spec, dataset) -> ProviderResult
```

where `dataset` is the dataset summary (columns, dtypes, stats, sample) and
`ProviderResult` is `{ "spec", "provider", "confidence" }` for `generate` and
`{ "spec", "patch", "provider", "confidence" }` for `patch` (the `spec` is the
current spec with `patch` already applied).

## Implementations

- **`FakeProvider`** — deterministic, no network. Derives a spec from keyword
  hints in the prompt and the dataset schema (e.g. prompt mentioning
  "distribution" → `box`/`histogram`; "over time"/"trend" → `line`; otherwise
  `scatter`). Used by tests and as the default when no API key is configured.
  Reports `provider: "fake"` and a fixed confidence.
- **`DecisionProvider`** — OpenAI **Decisions API** (`POST /v1/decisions`, model
  `gpt-6-luna`). Builds `choice`/`score`/`predicate` questions whose options come
  from the dataset schema, and maps the typed answers onto FigureSpec fields.
  Reports the answer `confidence`. This is the fast path for the primitive chart
  types and for categorical/ordinal parameter selection.
- **`StructuredProvider`** — OpenAI **Responses API** with Structured Outputs
  (a JSON schema for FigureSpec) for novel chart types. Used when the router
  picks the "novel" path.

## Router

`pick(prompt, dataset)` returns `"known"` or `"novel"`. The router may itself be
a Decisions `choice` question; when no provider is configured it falls back to a
keyword heuristic over the primitive chart types.

## Configuration

- `OPENAI_API_KEY` — required for the real providers.
- `FIGURELAB_PROVIDER` — `auto` (default) | `fake` | `decisions` | `structured`.
  `auto` = `fake` when no key is present, otherwise the router picks per request.
- `FIGURELAB_CONFIDENCE_THRESHOLD` — default `0.5`; results below this are still
  returned but flagged to the UI.

## Safety

- The API key is read only on the backend and never returned in any response.
- The model never emits executable code; only FigureSpec-shaped data.
- Large datasets are reduced to schema + statistics + a small sample before
  being sent to the model.
