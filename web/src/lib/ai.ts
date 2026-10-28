// The AI never writes code: it returns a JSON patch to the Spec, which goes
// through the same normalisation as every UI edit (and can be undone).

import { MARKS, PALETTES, PRESETS, normalizeSpec } from './spec';
import type { Dataset, Spec } from './types';

export interface AISettings { baseUrl: string; apiKey: string; model: string }

const SETTINGS_KEY = 'harryplotter.ai';

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { baseUrl: '', apiKey: '', model: '', ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return { baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', model: 'openai/gpt-4.1-mini' };
}

export function saveSettings(s: AISettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

let serverAI: boolean | null = null;

/** True when the bundled Python server is running with a key configured. */
export async function serverHasAI(): Promise<boolean> {
  if (serverAI !== null) return serverAI;
  try {
    const r = await fetch('api/health', { cache: 'no-store' });
    serverAI = r.ok && (await r.json()).ai === true;
  } catch { serverAI = false; }
  return serverAI;
}

export async function aiAvailable(): Promise<boolean> {
  return (await serverHasAI()) || !!loadSettings().apiKey;
}

function systemPrompt(dataset: Dataset): string {
  const cols = dataset.columns.map((c) => {
    const range = c.min !== undefined && c.type === 'number' ? ` range ${+c.min.toPrecision(4)}..${+c.max!.toPrecision(4)}` : '';
    const vals = c.type === 'category' ? ` values: ${c.sample.slice(0, 8).join(', ')}${c.unique > 8 ? ', …' : ''}` : '';
    return `- "${c.name}" (${c.type}, ${c.unique} distinct${range}${vals})`;
  }).join('\n');

  return `You are Harry, the assistant inside Harry Plotter, a scientific figure editor.
The researcher describes what they want; you answer ONLY with a JSON object:
{"patch": <partial spec>, "reply": "<one short sentence saying what you changed>"}
Write "reply" in the language of the user's request (English when unsure) — never another language.

The figure is described by this spec (TypeScript):
{
  mark: ${MARKS.map((m) => `"${m.id}"`).join(' | ')},
  enc: { x?, y?, color?, size?, facet? /* panels side by side */, facetRow? /* panels stacked */ }   // column names; set a key to null to remove it
  stats: {
    aggregate: "none"|"mean"|"median"|"sum"|"count"|"min"|"max",   // bar/line/heatmap summary
    error: "none"|"sd"|"se"|"ci95",            // error bars / bands around means
    trend: "none"|"linear"|"loess",            // scatter/line fit with 95% CI
    points: boolean,                           // overlay raw observations (bar/box/violin) or markers (line)
    test: boolean,                             // show r and p on trends, t-test / ANOVA brackets on groups
    bins: number, timeBin: "none"|"day"|"week"|"month"|"quarter"|"year",
    barMode: "group"|"stack"|"fill", sort: "none"|"asc"|"desc", labels: boolean  // labels = numbers in heatmap cells
  },
  style: {
    title, subtitle, caption, xLabel, yLabel, colorLabel: string,       // "" = automatic
    xScale, yScale: "linear"|"log"|"sqrt", xMin, xMax, yMin, yMax: number|null, zeroY: boolean,
    palette: ${PALETTES.map((p) => `"${p.id}"`).join(' | ')},
    theme: "clean"|"classic"|"minimal"|"dark", grid: "none"|"x"|"y"|"both", legend: "auto"|"top"|"right"|"none",
    font: "sans"|"serif"|"mono", fontSize: number /* pt */, markSize, opacity, lineWidth: number,
    preset: ${PRESETS.map((p) => `"${p.id}"`).join(' | ')} | "custom", widthMm, heightMm: number
  },
  filters: [{ column, in?: string[], min?: number, max?: number }],   // replaces the whole list
  annotations: [{ kind: "hline"|"vline", value: number, label?: string }]
}

Mark guide: scatter (num×num), line/area (time or ordered x), bar (category × number; no y = counts),
histogram/density (one number), box/violin/strip (category × number distributions), heatmap (category × category, color = numeric value),
corr (pairwise correlation of all numeric columns, no encodings).

Rules:
- Return only the fields that change. Keep everything else as is.
- Use exact column names from the dataset below.
- When the user picks a journal (Nature, Science, Cell, IEEE, PLOS), a thesis, slides or a poster, set style.preset (the app then sets size and fonts).
- Prefer colour-blind-safe palettes (okabe-ito) unless asked otherwise.
- If the request is impossible with this data, return {"patch": {}, "reply": "<why, and a suggestion>"}.

Dataset "${dataset.name}" — ${dataset.rows.length} rows:
${cols}`;
}

function extractJSON(text: string): any {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error('The model did not answer with JSON.');
}

/** Merge a partial spec into the current one. `null` in enc removes a slot; arrays are replaced. */
export function mergePatch(spec: Spec, patch: any): Spec {
  const out: any = structuredClone(spec);
  if (!patch || typeof patch !== 'object') return out;
  if (patch.mark) out.mark = patch.mark;
  if (patch.enc && typeof patch.enc === 'object') {
    for (const [k, v] of Object.entries(patch.enc)) {
      if (v === null || v === '') delete out.enc[k]; else out.enc[k] = v;
    }
  }
  if (patch.stats) Object.assign(out.stats, patch.stats);
  if (patch.style) {
    Object.assign(out.style, patch.style);
    const preset = PRESETS.find((p) => p.id === patch.style.preset);
    if (preset && patch.style.preset !== spec.style.preset) {
      Object.assign(out.style, { widthMm: preset.widthMm, heightMm: preset.heightMm, fontSize: preset.fontSize, font: preset.font }, patch.style.font ? { font: patch.style.font } : {});
    }
  }
  if (Array.isArray(patch.filters)) out.filters = patch.filters;
  if (Array.isArray(patch.annotations)) out.annotations = patch.annotations;
  return out;
}

export interface AIAnswer { spec: Spec; reply: string }

export async function askAI(
  prompt: string, spec: Spec, dataset: Dataset, history: { role: 'user' | 'assistant'; text: string }[],
): Promise<AIAnswer> {
  const messages = [
    { role: 'system', content: systemPrompt(dataset) },
    ...history.slice(-6).map((h) => ({ role: h.role, content: h.text })),
    { role: 'user', content: `Current spec:\n${JSON.stringify(spec)}\n\nRequest: ${prompt}` },
  ];

  let content: string;
  if (await serverHasAI()) {
    const r = await fetch('api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error ?? `AI server error ${r.status}`);
    content = body.content;
  } else {
    const s = loadSettings();
    if (!s.apiKey) throw new Error('No AI configured. Open settings to add an API key, or use the controls and ⌘K.');
    const r = await fetch(`${s.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey}` },
      body: JSON.stringify({ model: s.model, messages, temperature: 0.2, response_format: { type: 'json_object' } }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error?.message ?? `AI request failed (${r.status})`);
    content = body.choices?.[0]?.message?.content ?? '';
  }

  const parsed = extractJSON(content);
  const next = normalizeSpec(mergePatch(spec, parsed.patch ?? parsed.spec ?? {}), dataset);
  return { spec: next, reply: typeof parsed.reply === 'string' ? parsed.reply : 'Done.' };
}
