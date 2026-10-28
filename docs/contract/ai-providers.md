# Contract: AI providers

All model access sits behind one interface so the rest of the system never
depends on a specific OpenAI API. Backend-only; the frontend only sees the HTTP
responses from `docs/contract/http-api.md`.

## Interface

```text
ChartProvider.generate(prompt, dataset) -> ProviderResult
ChartProvider.patch(prompt, spec, dataset) -> ProviderResult
ChartProvider.suggest(dataset) -> SuggestionResult
ChartProvider.polish(spec, dataset) -> ProviderResult
```

where `dataset` is the dataset summary (columns, dtypes, stats, sample),
`ProviderResult` is `{ "spec", "provider", "confidence" }` for `generate` and
`{ "spec", "patch", "provider", "confidence" }` for `patch` (the `spec` is the
current spec with `patch` already applied), and `SuggestionResult` is
`{ "prompt", "provider" }`.

`suggest` proposes one natural-language chart request for the dataset. It needs
free-text generation, so only `StructuredProvider` implements it; the router
always sends `suggest` to the Structured provider, and `DecisionProvider` / the
fake provider do not implement it (the endpoint reports `llm_unavailable` when
no key is configured).

`polish` improves an existing spec towards the quality template, using a
**two-pass Decisions routine**: pass 1 asks a `predicate` per tunable field
(should it change?); pass 2 asks a `choice` for each flagged field (what value?).
Only `DecisionProvider` implements it. `RouterProvider.polish` exposes it on
demand (the "Polish" action); automatic cosmetic quality now comes from the
compiler's theme rather than a polish pass on every generation. The tunable
fields and the template live in the provider's `template` module.

## Implementations

- **`FakeProvider`** — deterministic, no network. Derives a spec from keyword
  hints in the prompt and the dataset schema (e.g. prompt mentioning
  "distribution" → `box`/`histogram`; "over time"/"trend" → `line`; otherwise
  `scatter`; "measure by category" → `bar` with a `groupby` transform). Used by
  tests and as the default when no API key is configured. Reports
  `provider: "fake"` and a fixed confidence.
- **`DecisionProvider`** — OpenAI **Decisions API** (`POST /v1/decisions`, model
  `gpt-6-luna`). Builds `choice`/`score`/`predicate` questions whose options come
  from the dataset schema, and maps the typed answers onto FigureSpec fields.
  Reports the answer `confidence`. The fast path for closed-vocabulary
  refinements (legend, palette, axis scale) and for the polish pass.
- **`StructuredProvider`** — OpenAI **Responses API** with Structured Outputs
  (a JSON schema for FigureSpec). Sent a system prompt that documents the chart
  matrix, aggregation guidance and a worked example. Builds whole figures from a
  request; the authoritative dataset reference is injected server-side rather
  than trusted from the model.

## Router

`RouterProvider` chooses per request:

- **generate** → always the LLM (`StructuredProvider`), which can express the
  whole spec; falls back to `DecisionProvider` if the model is unavailable.
- **patch** → `DecisionProvider` when `is_simple_refinement(prompt)` (a
  closed-vocabulary style tweak); otherwise `StructuredProvider`.
- **suggest** → `StructuredProvider` (needs free text).
- **polish** → `DecisionProvider`.

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
