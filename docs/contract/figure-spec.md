# Contract: FigureSpec (v1)

The **FigureSpec** is the single reproducible document that describes a figure.
It is the payload the AI produces/patches and the payload the UI edits. Both the
backend (Pydantic) and the frontend (TypeScript) implement exactly this shape.
This file is the source of truth; if code and this file disagree, this file wins.

## Shape

```jsonc
{
  "version": 1,
  "dataset": {
    "id": "<dataset-uuid>",
    "contentHash": "sha256:<hex>"
  },
  "transforms": [
    { "op": "filter",  "column": "group", "in": ["A", "B"] },
    { "op": "groupby", "by": ["group"], "agg": { "score": "mean" } },
    { "op": "sort",    "column": "score", "desc": true },
    { "op": "limit",   "n": 15 }
  ],
  "figure": {
    "chartType": "scatter",
    "series": [
      { "name": "Group A", "x": "time", "y": "score", "color": "group" }
    ]
  },
  "style": {
    "title": "Score over time",
    "subtitle": null,
    "axes": {
      "x": {
        "label": null, "range": [null, null], "scale": "linear",
        "reverse": false, "grid": true,
        "tickMode": "auto", "tickStep": null, "tickCount": null,
        "tickRotation": 0
      },
      "y": {
        "label": null, "range": [null, null], "scale": "linear",
        "reverse": false, "grid": true,
        "tickMode": "auto", "tickStep": null, "tickCount": null,
        "tickRotation": 0
      }
    },
    "legend": {
      "show": true, "position": "right", "orientation": "v",
      "columns": null, "title": null, "order": null, "fontSize": 12
    },
    "font": { "family": "Inter, sans-serif", "size": 12 },
    "palette": "default",
    "colorway": null,
    "marker": { "size": 8, "opacity": 1.0, "symbol": "circle" },
    "line": { "width": 2 },
    "background": "#ffffff",
    "margins": { "l": 80, "r": 20, "t": 60, "b": 60 },
    "size": { "width": 900, "height": 600 }
  },
  "meta": {
    "modelVersion": null,
    "createdAt": "2026-01-01T00:00:00Z"
  }
}
```

## Enums

- `figure.chartType`: fast path `scatter | line | bar | box | histogram`;
  extended `violin | heatmap | area`.
- `style.axes.{x,y}.scale`: `linear | log`.
- `style.axes.{x,y}.tickMode`: `auto | step | count`
  (`auto` = Plotly automatic; `step` uses `tickStep`; `count` uses `tickCount`).
- `style.legend.position`: `top | bottom | left | right`.
- `style.legend.orientation`: `h | v`.
- `style.palette`: `default | scientific | colorblind | grayscale`.
- `transforms[].op`: `filter | groupby | sort | limit`.
- `transforms[].agg` values: `mean | sum | median | min | max | count`.

## Chart type matrix (required columns)

| chartType | x | y | color |
| --------- | ------- | ------- | ------ |
| scatter   | req | req | opt |
| line      | req | req | opt |
| bar       | req | req | opt |
| box       | opt | req | opt |
| histogram | req | — | opt |
| violin    | opt | req | opt |
| heatmap   | req | req (z) | — |
| area      | req | req | opt |

`x`/`y`/`color` are column names from the dataset (after transforms). Choosing a
`color` column splits the data into one trace per category.

## Semantics

- `dataset.contentHash` is a SHA-256 of the uploaded file bytes; it lets a saved
  version detect that its dataset changed.
- `transforms` are applied in order, before rendering. They are validated: every
  referenced column must exist and the op must be well-formed.
- `style.axes.*.range` is `[min, max]`; either element may be `null` meaning
  "auto". Reversed axes use `reverse: true`.
- `style.legend.order`, when non-null, is a list of series names controlling
  display order.
- `meta.modelVersion` records which model produced the spec, when it came from AI.

## Defaults

The shape above shows the canonical defaults. A minimal valid spec may omit the
`style` block entirely; the backend fills defaults. `version` must be `1`.
`figure.chartType` and `figure.series` are always required.
