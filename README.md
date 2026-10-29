# Harry Plotter

**Publication-ready scientific figures in seconds — no code, no fighting with matplotlib.**

Drop a CSV or Excel file and you get a sensible, good-looking figure immediately.
Refine it with plain controls, with ⌘K, or by asking in plain language. Export a
vector PDF at the exact size your journal wants, or take the figure with you as
Python or R code.

![The editor](docs/editor.png)

## Why researchers like it

- **Instant first figure.** Harry reads your columns (numbers, dates, groups, units)
  and proposes the charts worth looking at first. It picks the measure that differs
  most between your groups and the strongest correlation.
- **Statistics where you need them.** Mean ± SD / SE / 95% CI, regression with
  confidence band, LOESS, Pearson r and p, Welch t-test brackets with stars, one-way
  ANOVA, raw points over bars, boxes and violins. Every value is checked against scipy
  in the test suite.
- **Journal-exact output.** Presets for Nature, Science, Cell, IEEE, PLOS, thesis,
  slides and posters set the physical size in mm and the font size in pt. PDF and SVG
  are vector; PNG and TIFF carry the right DPI (150–1200). What you see is the size you
  submit.
- **Reproducible.** Every figure exports as a runnable **Python (seaborn/matplotlib)**
  or **R (ggplot2)** script, or as a `.hplot.json` project with the data inside.
- **AI when you want it, never required.** Ask “compare reaction time across doses with
  95% CI and p-values, Nature single column” and it happens. The AI only edits the
  figure description (no generated code runs), and every change can be undone. Without
  a key, short phrases still work offline (“log y”, “color by group”, “violin”,
  “bianco e nero”), as does the ⌘K command palette.
- **Your data stays on your computer.** Everything runs in the browser. The optional
  local server only proxies AI requests.
- **Improve this plot.** One click measures the real layout and fixes what annoys
  reviewers: overlapping tick labels, crowded legends, overplotting, bad bin counts,
  skewed axes, text below 6 pt. With AI on, a vision model then looks at the rendered
  figure and polishes what is left. Everything can be undone.
- **Ideas from your data.** Harry reads a statistical summary of your dataset (types,
  ranges, group sizes, correlations; never the raw rows) and proposes figures, each one
  tied to a concrete research question.
- **Edit on the figure.** Double-click the title, an axis label or the legend title to rewrite it in place.
- **Paste from Excel.** Copy cells, press ⌘V, done.

| | |
|---|---|
| ![](docs/example-volcano.png) | ![](docs/example-stripes.png) |
| ![](docs/example-simpson.png) | ![](docs/example-dose.png) |
| ![](docs/example-bar.png) | ![](docs/example-violin.png) |

Eight example datasets ship with the editor (all synthetic, from `samples/generate.py`), each
opening on a showcase figure: RNA-seq volcano, warming stripes, a seabird Simpson's paradox,
dose–response curves, a clinical trial, a reaction-time experiment, bacterial growth and online
polarisation.

## Use it

**From Python / Jupyter**

```bash
pip install git+https://github.com/alessiogandelli/harryplotter
```

```python
import harryplotter as hp
hp.plot(df)               # a pandas DataFrame: the editor opens inside the notebook
hp.plot("results.xlsx")   # or a file
```

**From a terminal**

```bash
harryplotter results.csv
```

**AI (optional).** Set one of these before starting and the key stays on the server:

```bash
export OPENROUTER_API_KEY=...        # or OPENAI_API_KEY=...
export HARRYPLOTTER_MODEL=deepseek/deepseek-v4.1-flash   # the default; any vision-capable model works
# any OpenAI-compatible endpoint, e.g. a local Ollama:
export HARRYPLOTTER_BASE_URL=http://localhost:11434/v1 HARRYPLOTTER_API_KEY=ollama HARRYPLOTTER_MODEL=qwen2.5:7b
```

**What it costs.** Measured with real calls on the example dataset (OpenRouter prices, Oct 2026):

| action | tokens in / out | gpt-4.1-mini | deepseek-v4.1-flash (default) |
|---|---|---|---|
| edit by prompt | ~1.3k / 0.2–0.4k | $0.0008 | $0.0004 |
| improve (with image) | ~2k / 0.03–1.3k | $0.0009 | $0.0008 |
| ideas from data | ~1.5k / 0.6–1.6k | $0.0015 | $0.0009 |

That is roughly 1.5 cents for a long session with the default model (30 edits, 5 improves, 2 idea rounds), and the
deterministic half of Improve, ⌘K and the offline phrases cost nothing.

The editor also works as a plain static site (GitHub Pages, a file share). In that
case the AI key is entered in Settings and stays in the browser.

## Hosting

The editor is a static site; the Python server is optional and only adds the AI proxy
(and file hand-over for `hp.plot`). Three ways to run it:

**1. Hosted editor on Cloudflare Pages, with an optional backend**

```bash
cd web
VITE_HP_SERVER=https://api.your-domain.org npm run build      # where your backend will live
npx wrangler pages deploy ../python/harryplotter/static --project-name harryplotter
```

Run the backend wherever you like (a server, or your own machine behind a Cloudflare Tunnel;
it must be reachable over https):

```bash
OPENROUTER_API_KEY=... harryplotter --host 0.0.0.0 --no-browser \
  --allow-origin https://harryplotter.pages.dev --daily-limit 100
```

- Backend **on**: the editor finds it at start-up and uses it; your key never reaches browsers.
- Backend **off**: the editor notices within 2.5 s and falls back to what each researcher set in
  Settings: their own key (OpenRouter, OpenAI…, called straight from the browser), a model on
  their computer, or no AI. Every non-AI feature always works.
- `--allow-origin` is CORS: it lets the hosted page call the server. It is **not** access
  control — anyone who knows the URL can call it — so use a dedicated OpenRouter key with a
  monthly credit limit, and `--daily-limit` (requests per client IP per day; behind Cloudflare
  the real IP is taken from `CF-Connecting-IP`).

**Local models from the hosted editor.** The page is on another origin, so the model server
must allow it: Ollama `OLLAMA_ORIGINS=https://harryplotter.pages.dev ollama serve`; LM Studio
→ enable CORS; llama.cpp's `llama-server` already allows it. Chrome/Edge may ask permission to
reach the local network. Safari may block https → `http://localhost`; there, run Harry locally.
Settings → *Test* checks the connection.

**2. Everything on your machine**

```bash
pip install git+https://github.com/alessiogandelli/harryplotter
harryplotter data.csv            # or hp.plot(df) in Jupyter
```

**3. Self-hosted for a lab (Docker)**

```bash
docker build -t harryplotter .
docker run -p 8765:8765 -e OPENROUTER_API_KEY=... -e HARRYPLOTTER_DAILY_LIMIT=200 harryplotter
```

**What the AI sees.** Column names, up to 8 example values per column, summary statistics
and the figure settings; for *Improve*, a picture of the figure. Never the rows. Settings →
*Off* disables AI entirely.

## Chart types

Scatter · Line · Area · Bar · Histogram · Density · Box · Violin · Dots (jitter +
mean ± CI) · Heatmap · Correlation matrix, all with colour groups, small multiples
(panels by column and/or row), filters, log/sqrt scales, reference lines, and
colour-blind-safe palettes (Okabe–Ito by default, plus NPG, Lancet, Tableau, viridis…).

## Develop

```
web/       the editor: React + TypeScript + Observable Plot (Vite)
  src/lib/   spec, rendering, stats, code export, AI, offline commands — UI-free and unit-tested
python/    the `harryplotter` package: stdlib-only server, CLI, `hp.plot()`; ships the built editor
samples/   generator for the example datasets
```

```bash
cd web && npm install
npm run dev            # editor at http://localhost:5173 (proxies /api to :8765)
npm test               # unit tests: stats vs scipy, labels, offline commands, code export
npm run build          # builds into python/harryplotter/static

cd .. && uv run --with pytest --with-editable . pytest   # server tests
HP_CODEGEN_OUT=/tmp/hp npm --prefix web test               # also writes every generated script, to run them
```

### How it works

One small JSON document, the **spec**, describes the figure: chart type, which
columns go where, statistics, style, size, filters. The UI, ⌘K, the offline phrase
parser and the AI all produce changes to that spec. Every change goes through the same
validation (`normalizeSpec`) and lands on the undo stack. The renderer turns the spec
into SVG with Observable Plot. The exporters turn the same spec into PDF/PNG/TIFF or
into Python and R code.
