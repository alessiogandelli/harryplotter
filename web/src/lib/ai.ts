// The AI never writes code: it returns a JSON patch to the Spec, which goes
// through the same normalisation as every UI edit (and can be undone).

import { DEFAULT_STATS, MARKS, PALETTES, PRESETS, normalizeSpec } from './spec';
import type { Dataset, Spec } from './types';

/**
 * Where the AI comes from. The hosted editor is a static site: when its Harry Plotter
 * server is on, requests go there (the key stays on the server); when it is off, the
 * researcher can use their own key, a model running on their machine, or no AI at all.
 */
export type AIMode = 'auto' | 'server' | 'key' | 'local' | 'off';

export interface AISettings {
  mode: AIMode;
  /** Harry Plotter server; empty = the same address as the editor (or the build default) */
  serverUrl: string;
  /** your own key: any OpenAI-compatible API */
  baseUrl: string;
  apiKey: string;
  model: string;
  /** a model on this computer: Ollama, LM Studio, llama.cpp… (no key) */
  localUrl: string;
  localModel: string;
}

const SETTINGS_KEY = 'harryplotter.ai';

/** Set at build time for the hosted editor, e.g. VITE_HP_SERVER=https://api.harryplotter.example */
const DEFAULT_SERVER: string = (import.meta.env.VITE_HP_SERVER as string | undefined) ?? '';

const DEFAULTS: AISettings = {
  mode: 'auto', serverUrl: '',
  baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', model: 'deepseek/deepseek-v4.1-flash',
  localUrl: 'http://localhost:11434/v1', localModel: 'qwen2.5vl:7b',
};

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return { ...DEFAULTS };
}

export function saveSettings(s: AISettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  health = null;
}

const serverBase = (s: AISettings) => {
  const url = (s.serverUrl || DEFAULT_SERVER).trim();
  return url ? `${url.replace(/\/$/, '')}/` : '';
};

let health: { base: string; ok: boolean; model?: string; at: number } | null = null;

/** Is a Harry Plotter server with AI reachable? Cached for a minute; 2.5 s timeout so a switched-off server costs nothing. */
export async function serverHasAI(force = false): Promise<boolean> {
  const base = serverBase(loadSettings());
  if (!force && health && health.base === base && Date.now() - health.at < 60_000) return health.ok;
  let ok = false, model: string | undefined;
  try {
    const r = await fetch(`${base}api/health`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    const j = r.ok ? await r.json() : null;
    ok = j?.ai === true;
    model = j?.model ?? undefined;
  } catch { ok = false; }
  health = { base, ok, model, at: Date.now() };
  return ok;
}

export interface AISource { kind: 'server' | 'key' | 'local' | 'none'; label: string; detail?: string }

/** Which AI the next request will use. */
export async function aiSource(): Promise<AISource> {
  const s = loadSettings();
  if (s.mode === 'off') return { kind: 'none', label: 'AI off' };
  if ((s.mode === 'auto' || s.mode === 'server') && (await serverHasAI())) {
    return { kind: 'server', label: 'Harry server', detail: health?.model };
  }
  if (s.mode === 'server') return { kind: 'none', label: 'Server unreachable' };
  if ((s.mode === 'auto' || s.mode === 'key') && s.apiKey) return { kind: 'key', label: 'Your key', detail: s.model };
  if (s.mode === 'local' && s.localUrl) return { kind: 'local', label: 'Local model', detail: s.localModel };
  return { kind: 'none', label: 'Offline' };
}

/** Can this browser reach the local model? (Fails when it is not running or blocks this site via CORS.) */
export async function testLocal(s: AISettings): Promise<string | null> {
  try {
    const r = await fetch(`${s.localUrl.replace(/\/$/, '')}/models`, { signal: AbortSignal.timeout(2500) });
    return r.ok ? null : `answered ${r.status}`;
  } catch {
    return 'not reachable: not running, or not allowing this site (CORS)';
  }
}

export async function aiAvailable(): Promise<boolean> {
  return (await aiSource()).kind !== 'none';
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
    xScale, yScale: "linear"|"log"|"sqrt", xMin, xMax, yMin, yMax: number|null, zeroY: boolean, xTickAngle: number|null /* 0-90, null = auto */,
    palette: ${PALETTES.map((p) => `"${p.id}"`).join(' | ')},
    colors: { [groupValue: string]: "#rrggbb" },   // exact colours per group of the colour column; key "*" = colour of a single-series chart; replaces the whole map
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

export interface Usage { kind: string; prompt: number; completion: number; model: string }

/** Every AI call of this session, so the cost is never a surprise (shown in Settings). */
export const usageLog: Usage[] = [];

type Message = { role: string; content: string | unknown[] };

/** One chat completion through the local server (key stays there) or straight from the browser. */
async function chat(kind: string, messages: Message[]): Promise<string> {
  const s = loadSettings();
  const source = await aiSource();
  let body: any;
  if (source.kind === 'server') {
    const r = await fetch(`${serverBase(s)}api/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) });
    body = await r.json().catch(() => ({}));
    if (!r.ok) {
      health = null; // the server may have just gone away: look again next time
      throw new Error(body.error ?? `AI server error ${r.status}`);
    }
  } else if (source.kind === 'key' || source.kind === 'local') {
    const local = source.kind === 'local';
    const url = `${(local ? s.localUrl : s.baseUrl).replace(/\/$/, '')}/chat/completions`;
    const call = (json: boolean) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(local ? {} : { Authorization: `Bearer ${s.apiKey}` }) },
      body: JSON.stringify({ model: local ? s.localModel : s.model, messages, temperature: 0.2, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
    });
    let r: Response;
    try {
      r = await call(true);
      // some local servers reject response_format: retry once without it (the prompt still asks for JSON)
      if (r.status === 400 || r.status === 422) r = await call(false);
    } catch {
      throw new Error(local
        ? `Cannot reach the local model at ${s.localUrl}. Is it running, and does it allow this site (CORS)? See Settings.`
        : `Cannot reach ${s.baseUrl}. Check the address and your connection.`);
    }
    const raw = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(raw.error?.message ?? raw.error ?? `AI request failed (${r.status})`);
    body = { content: raw.choices?.[0]?.message?.content ?? '', usage: raw.usage, model: raw.model ?? (local ? s.localModel : s.model) };
  } else {
    throw new Error(source.label === 'AI off'
      ? 'AI is switched off in Settings.'
      : 'No AI connected. Open Settings to use your own key or a local model, or keep using the controls and ⌘K.');
  }
  if (body.usage) usageLog.push({ kind, prompt: body.usage.prompt_tokens ?? 0, completion: body.usage.completion_tokens ?? 0, model: body.model ?? '' });
  return body.content ?? '';
}

export interface AIAnswer { spec: Spec; reply: string }

export async function askAI(
  prompt: string, spec: Spec, dataset: Dataset, history: { role: 'user' | 'assistant'; text: string }[],
): Promise<AIAnswer> {
  const content = await chat('edit', [
    { role: 'system', content: systemPrompt(dataset) },
    ...history.slice(-6).map((h) => ({ role: h.role, content: h.text })),
    { role: 'user', content: `Current spec:\n${JSON.stringify(spec)}\n\nRequest: ${prompt}` },
  ]);
  const parsed = extractJSON(content);
  const next = normalizeSpec(mergePatch(spec, parsed.patch ?? parsed.spec ?? {}), dataset);
  return { spec: next, reply: typeof parsed.reply === 'string' ? parsed.reply : 'Done.' };
}

// ---------------------------------------------------------------- ideas from the data

/**
 * A compact statistical portrait of the dataset: types, ranges, group sizes and the
 * strongest correlations. This — never the raw rows — is what the model sees.
 */
export function profile(dataset: Dataset): string {
  const lines: string[] = [`Dataset "${dataset.name}", ${dataset.rows.length} rows.`];
  const nums = dataset.columns.filter((c) => c.type === 'number');
  for (const c of dataset.columns) {
    const vals = dataset.rows.map((r) => r[c.name]).filter((v) => v !== null && v !== undefined);
    if (c.type === 'number') {
      const xs = vals as number[];
      const mean = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length - 1));
      lines.push(`- "${c.name}": number, ${c.unique} distinct, range ${fmt(c.min)}..${fmt(c.max)}, mean ${fmt(mean)}, sd ${fmt(sd)}${c.missing ? `, ${c.missing} missing` : ''}`);
    } else if (c.type === 'category') {
      const counts = new Map<string, number>();
      for (const v of vals) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
      const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} (${n})`).join(', ');
      lines.push(`- "${c.name}": category, ${c.unique} levels: ${top}${c.unique > 8 ? ', …' : ''}`);
    } else if (c.type === 'date') {
      lines.push(`- "${c.name}": date, ${new Date(c.min!).toISOString().slice(0, 10)} to ${new Date(c.max!).toISOString().slice(0, 10)}, ${c.unique} distinct days`);
    } else {
      lines.push(`- "${c.name}": free text, ${c.unique} distinct (e.g. ${c.sample.slice(0, 3).join(' | ')})`);
    }
  }
  const pairs: string[] = [];
  for (let i = 0; i < Math.min(nums.length, 12); i++) for (let j = i + 1; j < Math.min(nums.length, 12); j++) {
    const r = corr(dataset, nums[i].name, nums[j].name);
    if (Number.isFinite(r) && Math.abs(r) >= 0.2) pairs.push(`${nums[i].name}~${nums[j].name} r=${r.toFixed(2)}`);
  }
  if (pairs.length) lines.push(`Notable correlations: ${pairs.slice(0, 12).join('; ')}`);
  return lines.join('\n');
}

const fmt = (v?: number) => (v === undefined || !Number.isFinite(v) ? '?' : Math.abs(v) >= 1000 || Math.abs(v) < 0.01 ? v.toPrecision(3) : String(Math.round(v * 1000) / 1000));

function corr(d: Dataset, a: string, b: string): number {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (const r of d.rows) {
    const x = r[a], y = r[b];
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    n++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
  }
  const cov = sab - (sa * sb) / n, va = saa - (sa * sa) / n, vb = sbb - (sb * sb) / n;
  return n > 2 && va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : NaN;
}

export interface Idea { title: string; question: string; why: string; spec: Spec }

export async function suggestIdeas(dataset: Dataset, base: Spec, context = ''): Promise<Idea[]> {
  const content = await chat('ideas', [
    { role: 'system', content: `${systemPrompt(dataset)}

TASK NOW: act as a senior data scientist reviewing this dataset for a researcher. Propose 6 figures worth making,
each answering a different scientific question (comparisons between groups, relationships, change over time, distributions,
interactions between two factors, data quality checks such as outliers or missing values).
Prefer figures that reveal something specific about THESE columns, not generic ones. Use statistics where they help
(error bars, trend lines, tests). Answer ONLY with JSON:
{"ideas": [{"title": "<short figure title>", "question": "<the research question it answers>", "why": "<one sentence: what in the data makes it interesting>", "patch": <partial spec>}]}` },
    { role: 'user', content: `${profile(dataset)}${context ? `\n\nWhat the researcher is studying: ${context}` : ''}` },
  ]);
  const parsed = extractJSON(content);
  const list = Array.isArray(parsed.ideas) ? parsed.ideas : [];
  return list.slice(0, 8).map((it: any) => {
    const patch = it.patch ?? it.spec ?? {};
    // keep the look (size, palette, fonts) but none of the current figure's labels or ranges
    const clean = { ...base, enc: {}, stats: { ...DEFAULT_STATS }, filters: [], annotations: [], style: { ...base.style, title: '', subtitle: '', caption: '', xLabel: '', yLabel: '', colorLabel: '', xMin: null, xMax: null, yMin: null, yMax: null, xScale: 'linear', yScale: 'linear', zeroY: false, xTickAngle: null } } as Spec;
    const spec = normalizeSpec(mergePatch(clean, { ...patch, style: { ...(patch.style ?? {}), title: '' } }), dataset);
    return { title: String(it.title ?? 'Idea'), question: String(it.question ?? ''), why: String(it.why ?? ''), spec };
  }).filter((i: Idea) => i.spec.mark === 'corr' || Object.keys(i.spec.enc).length > 0);
}

// ---------------------------------------------------------------- improve: a second pair of eyes

export interface Critique { spec: Spec; changes: string[] }

/** Show the rendered figure to a vision model and let it fix what still looks wrong. */
export async function critiqueFigure(spec: Spec, dataset: Dataset, png: string, alreadyFixed: string[]): Promise<Critique> {
  const content = await chat('improve', [
    { role: 'system', content: `${systemPrompt(dataset)}

TASK NOW: you are a meticulous figure editor for a scientific journal. Look at the rendered figure and its spec.
Fix only real problems a reviewer would flag: overlapping or cramped labels, unreadable tick labels, misleading scales,
cluttered legends, poor colour choices for the data, missing units in axis labels (only when obvious from the column name),
chart type that hides the message, overplotting, wasted space, inconsistent capitalisation.
Do NOT change what is plotted or the size preset unless it is clearly wrong. Never undo the automatic fixes listed by the user (they were measured on the real layout). If the figure is fine, return an empty patch.
Answer ONLY with JSON: {"patch": <partial spec>, "changes": ["<each change in a few words>"]}` },
    { role: 'user', content: [
      { type: 'text', text: `Spec:\n${JSON.stringify(spec)}\n\nAlready fixed automatically: ${alreadyFixed.join('; ') || 'nothing'}` },
      { type: 'image_url', image_url: { url: png } },
    ] },
  ]);
  const parsed = extractJSON(content);
  const changes = Array.isArray(parsed.changes) ? parsed.changes.map(String).filter(Boolean) : [];
  return { spec: normalizeSpec(mergePatch(spec, parsed.patch ?? {}), dataset), changes };
}
