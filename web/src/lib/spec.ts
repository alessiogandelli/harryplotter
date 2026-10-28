import type {
  Aggregate, BarMode, Dataset, EncodingSlot, ErrorKind, FontKind, GridKind, LegendKind,
  MarkType, ScaleKind, SortKind, Spec, Stats, Style, ThemeKind, TimeBin, TrendKind,
} from './types';

// ---------------------------------------------------------------- palettes

export interface Palette {
  id: string;
  label: string;
  kind: 'categorical' | 'sequential' | 'diverging';
  colors: string[];
  /** d3 / Observable Plot scheme name for continuous use */
  scheme?: string;
  note?: string;
}

export const PALETTES: Palette[] = [
  {
    id: 'okabe-ito', label: 'Okabe–Ito', kind: 'categorical', note: 'colour-blind safe',
    colors: ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#F0E442', '#000000'],
  },
  {
    id: 'tableau', label: 'Tableau 10', kind: 'categorical',
    colors: ['#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'],
  },
  {
    id: 'npg', label: 'Nature (NPG)', kind: 'categorical',
    colors: ['#E64B35', '#4DBBD5', '#00A087', '#3C5488', '#F39B7F', '#8491B4', '#91D1C2', '#DC0000', '#7E6148'],
  },
  {
    id: 'lancet', label: 'Lancet', kind: 'categorical',
    colors: ['#00468B', '#ED0000', '#42B540', '#0099B4', '#925E9F', '#FDAF91', '#AD002A', '#ADB6B6'],
  },
  {
    id: 'dark2', label: 'Dark 2', kind: 'categorical',
    colors: ['#1B9E77', '#D95F02', '#7570B3', '#E7298A', '#66A61E', '#E6AB02', '#A6761D', '#666666'],
  },
  {
    id: 'pastel', label: 'Soft', kind: 'categorical',
    colors: ['#8DA0CB', '#FC8D62', '#66C2A5', '#E78AC3', '#A6D854', '#FFD92F', '#E5C494', '#B3B3B3'],
  },
  {
    id: 'updown', label: 'Down · Up · n.s.', kind: 'categorical', note: 'volcano plots',
    colors: ['#2B6CB0', '#C0392B', '#BDBDBD', '#E69F00', '#009E73', '#CC79A7'],
  },
  {
    id: 'grayscale', label: 'Grayscale', kind: 'categorical', note: 'print safe',
    colors: ['#1a1a1a', '#6e6e6e', '#a8a8a8', '#d0d0d0', '#444444', '#8c8c8c'],
  },
  { id: 'viridis', label: 'Viridis', kind: 'sequential', scheme: 'viridis', colors: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
  { id: 'cividis', label: 'Cividis', kind: 'sequential', scheme: 'cividis', colors: ['#00224e', '#3d4d6e', '#7d7c78', '#bcaf6f', '#fee838'] },
  { id: 'magma', label: 'Magma', kind: 'sequential', scheme: 'magma', colors: ['#000004', '#51127c', '#b73779', '#fc8961', '#fcfdbf'] },
  { id: 'rdbu', label: 'Blue – Red', kind: 'diverging', scheme: 'rdbu', note: 'centred on 0', colors: ['#2166ac', '#92c5de', '#f7f7f7', '#f4a582', '#b2182b'] },
  { id: 'blues', label: 'Blues', kind: 'sequential', scheme: 'blues', colors: ['#deebf7', '#9ecae1', '#4292c6', '#08519c', '#08306b'] },
];

export const paletteById = (id: string) => PALETTES.find((p) => p.id === id) ?? PALETTES[0];

/** Colours for categorical series, in fixed order. */
export function categoricalColors(id: string): string[] {
  const p = paletteById(id);
  if (p.kind === 'categorical') return p.colors;
  if (p.kind === 'diverging') return [p.colors[0], p.colors[4], p.colors[1], p.colors[3]];
  // sample the sequential ramp, skipping the pale end so marks stay visible
  return [p.colors[0], p.colors[2], p.colors[3], p.colors[1], p.colors[4]];
}

/** Scheme for continuous colour (numeric colour column, heatmap). */
export function sequentialScheme(id: string): string {
  const p = paletteById(id);
  return p.kind !== 'categorical' && p.scheme ? p.scheme : 'viridis';
}

/** Observable Plot colour scale for continuous values; diverging palettes pivot on 0, cold = blue. */
export function continuousColor(id: string, domain?: [number, number]): Record<string, unknown> {
  const p = paletteById(id);
  if (p.kind === 'diverging') {
    const m = domain ? Math.max(Math.abs(domain[0]), Math.abs(domain[1])) : undefined;
    return { type: 'diverging', scheme: p.scheme, reverse: true, pivot: 0, clamp: true, ...(m ? { domain: [-m, m] } : {}) };
  }
  return { type: 'linear', scheme: sequentialScheme(id), ...(domain ? { domain } : {}) };
}

// ---------------------------------------------------------------- size presets

export interface SizePreset {
  id: string;
  label: string;
  group: string;
  widthMm: number;
  heightMm: number;
  fontSize: number;
  font: FontKind;
}

export const PRESETS: SizePreset[] = [
  { id: 'article', label: 'Article figure', group: 'General', widthMm: 160, heightMm: 105, fontSize: 9, font: 'sans' },
  { id: 'thesis', label: 'Thesis / A4 report', group: 'General', widthMm: 150, heightMm: 100, fontSize: 10, font: 'serif' },
  { id: 'slide', label: 'Slide 16:9', group: 'General', widthMm: 254, heightMm: 143, fontSize: 16, font: 'sans' },
  { id: 'poster', label: 'Poster panel', group: 'General', widthMm: 300, heightMm: 200, fontSize: 22, font: 'sans' },
  { id: 'nature-1', label: 'Nature · 1 column', group: 'Journals', widthMm: 89, heightMm: 66, fontSize: 7, font: 'sans' },
  { id: 'nature-2', label: 'Nature · 2 columns', group: 'Journals', widthMm: 183, heightMm: 100, fontSize: 7, font: 'sans' },
  { id: 'science-2', label: 'Science · 2 columns', group: 'Journals', widthMm: 121, heightMm: 80, fontSize: 7, font: 'sans' },
  { id: 'cell-1', label: 'Cell · 1 column', group: 'Journals', widthMm: 85, heightMm: 64, fontSize: 7, font: 'sans' },
  { id: 'cell-2', label: 'Cell · 2 columns', group: 'Journals', widthMm: 174, heightMm: 100, fontSize: 7, font: 'sans' },
  { id: 'ieee-1', label: 'IEEE · 1 column', group: 'Journals', widthMm: 88.9, heightMm: 66, fontSize: 8, font: 'serif' },
  { id: 'ieee-2', label: 'IEEE · 2 columns', group: 'Journals', widthMm: 181, heightMm: 95, fontSize: 8, font: 'serif' },
  { id: 'plos', label: 'PLOS · full width', group: 'Journals', widthMm: 190, heightMm: 110, fontSize: 8, font: 'sans' },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);

export const MM_TO_PX = 96 / 25.4;
export const PT_TO_PX = 96 / 72;

// ---------------------------------------------------------------- marks

export interface MarkInfo {
  id: MarkType;
  label: string;
  /** encoding slots this mark understands */
  slots: EncodingSlot[];
  /** slots that must be filled to draw anything */
  required: EncodingSlot[];
  hint: string;
}

export const MARKS: MarkInfo[] = [
  { id: 'scatter', label: 'Scatter', slots: ['x', 'y', 'color', 'size', 'facet', 'facetRow'], required: ['x', 'y'], hint: 'Two numbers, one dot per row' },
  { id: 'line', label: 'Line', slots: ['x', 'y', 'color', 'facet', 'facetRow'], required: ['x', 'y'], hint: 'Change over time or dose' },
  { id: 'area', label: 'Area', slots: ['x', 'y', 'color', 'facet', 'facetRow'], required: ['x', 'y'], hint: 'Cumulative or stacked totals' },
  { id: 'bar', label: 'Bar', slots: ['x', 'y', 'color', 'facet', 'facetRow'], required: ['x'], hint: 'Compare groups' },
  { id: 'histogram', label: 'Histogram', slots: ['x', 'color', 'facet', 'facetRow'], required: ['x'], hint: 'Distribution of one number' },
  { id: 'density', label: 'Density', slots: ['x', 'color', 'facet', 'facetRow'], required: ['x'], hint: 'Smooth distribution' },
  { id: 'box', label: 'Box', slots: ['x', 'y', 'color', 'facetRow'], required: ['y'], hint: 'Median, quartiles, outliers' },
  { id: 'violin', label: 'Violin', slots: ['x', 'y', 'color', 'facetRow'], required: ['y'], hint: 'Full shape of each group' },
  { id: 'strip', label: 'Dots', slots: ['x', 'y', 'color', 'facetRow'], required: ['y'], hint: 'Every observation, jittered' },
  { id: 'heatmap', label: 'Heatmap', slots: ['x', 'y', 'color', 'facet'], required: ['x', 'y'], hint: 'Two categories, one value' },
  { id: 'corr', label: 'Correlation', slots: [], required: [], hint: 'All numeric columns, pairwise r' },
];

export const markInfo = (m: MarkType) => MARKS.find((x) => x.id === m) ?? MARKS[0];

/** Charts whose x axis is a set of groups drawn by our own layout. */
export const CATEGORICAL_MARKS: MarkType[] = ['bar', 'box', 'violin', 'strip'];

// ---------------------------------------------------------------- defaults

export const DEFAULT_STATS: Stats = {
  aggregate: 'none',
  error: 'none',
  trend: 'none',
  points: false,
  test: false,
  bins: 30,
  timeBin: 'none',
  barMode: 'group',
  sort: 'none',
  labels: true,
};

export const DEFAULT_STYLE: Style = {
  title: '',
  subtitle: '',
  caption: '',
  xLabel: '',
  yLabel: '',
  colorLabel: '',
  xScale: 'linear',
  yScale: 'linear',
  xMin: null,
  xMax: null,
  yMin: null,
  yMax: null,
  zeroY: false,
  xTickAngle: null,
  palette: 'okabe-ito',
  theme: 'clean',
  grid: 'y',
  legend: 'auto',
  font: 'sans',
  fontSize: 9,
  markSize: 3.5,
  opacity: 0.85,
  lineWidth: 1.75,
  preset: 'article',
  widthMm: 160,
  heightMm: 105,
};

export function emptySpec(): Spec {
  return {
    version: 1,
    mark: 'scatter',
    enc: {},
    stats: { ...DEFAULT_STATS },
    style: { ...DEFAULT_STYLE },
    filters: [],
    annotations: [],
  };
}

// ---------------------------------------------------------------- normalisation
// Everything that enters the store (UI edits, AI answers, loaded projects) goes
// through here, so the renderer can trust the spec it gets.

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const num = (value: unknown, fallback: number, min = -Infinity, max = Infinity): number => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

const MARK_IDS = MARKS.map((m) => m.id);
const AGGS: Aggregate[] = ['none', 'mean', 'median', 'sum', 'count', 'min', 'max'];
const ERRORS: ErrorKind[] = ['none', 'sd', 'se', 'ci95'];
const TRENDS: TrendKind[] = ['none', 'linear', 'loess'];
const SCALES: ScaleKind[] = ['linear', 'log', 'sqrt'];
const THEMES: ThemeKind[] = ['clean', 'classic', 'minimal', 'dark'];
const GRIDS: GridKind[] = ['none', 'x', 'y', 'both'];
const LEGENDS: LegendKind[] = ['auto', 'top', 'right', 'none'];
const FONTS: FontKind[] = ['sans', 'serif', 'mono'];
const BARMODES: BarMode[] = ['group', 'stack', 'fill'];
const SORTS: SortKind[] = ['none', 'asc', 'desc'];
const TIMEBINS: TimeBin[] = ['none', 'day', 'week', 'month', 'quarter', 'year'];

/** Find a column by exact name, then case-insensitively (the AI is sloppy with case). */
function resolveColumn(name: unknown, dataset?: Dataset | null): string | undefined {
  if (typeof name !== 'string' || !name) return undefined;
  if (!dataset) return name;
  const exact = dataset.columns.find((c) => c.name === name);
  if (exact) return exact.name;
  const loose = dataset.columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
  return loose?.name;
}

export function normalizeSpec(input: unknown, dataset?: Dataset | null): Spec {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const enc = (raw.enc ?? {}) as Record<string, unknown>;
  const st = (raw.stats ?? {}) as Record<string, unknown>;
  const sy = (raw.style ?? {}) as Record<string, unknown>;
  const d = DEFAULT_STATS;
  const s = DEFAULT_STYLE;

  const spec: Spec = {
    version: 1,
    mark: oneOf(raw.mark, MARK_IDS, 'scatter'),
    enc: {},
    stats: {
      aggregate: oneOf(st.aggregate, AGGS, d.aggregate),
      error: oneOf(st.error, ERRORS, d.error),
      trend: oneOf(st.trend, TRENDS, d.trend),
      points: typeof st.points === 'boolean' ? st.points : d.points,
      test: typeof st.test === 'boolean' ? st.test : d.test,
      bins: Math.round(num(st.bins, d.bins, 3, 200)),
      timeBin: oneOf(st.timeBin, TIMEBINS, d.timeBin),
      barMode: oneOf(st.barMode, BARMODES, d.barMode),
      sort: oneOf(st.sort, SORTS, d.sort),
      labels: typeof st.labels === 'boolean' ? st.labels : d.labels,
    },
    style: {
      title: str(sy.title),
      subtitle: str(sy.subtitle),
      caption: str(sy.caption),
      xLabel: str(sy.xLabel),
      yLabel: str(sy.yLabel),
      colorLabel: str(sy.colorLabel),
      xScale: oneOf(sy.xScale, SCALES, s.xScale),
      yScale: oneOf(sy.yScale, SCALES, s.yScale),
      xMin: numOrNull(sy.xMin),
      xMax: numOrNull(sy.xMax),
      yMin: numOrNull(sy.yMin),
      yMax: numOrNull(sy.yMax),
      zeroY: typeof sy.zeroY === 'boolean' ? sy.zeroY : s.zeroY,
      xTickAngle: sy.xTickAngle === null || sy.xTickAngle === undefined || sy.xTickAngle === 'auto' ? null : num(sy.xTickAngle, 0, 0, 90),
      palette: PALETTES.some((p) => p.id === sy.palette) ? (sy.palette as string) : s.palette,
      theme: oneOf(sy.theme, THEMES, s.theme),
      grid: oneOf(sy.grid, GRIDS, s.grid),
      legend: oneOf(sy.legend, LEGENDS, s.legend),
      font: oneOf(sy.font, FONTS, s.font),
      fontSize: num(sy.fontSize, s.fontSize, 4, 48),
      markSize: num(sy.markSize, s.markSize, 0.5, 20),
      opacity: num(sy.opacity, s.opacity, 0.05, 1),
      lineWidth: num(sy.lineWidth, s.lineWidth, 0.25, 10),
      preset: typeof sy.preset === 'string' && (sy.preset === 'custom' || presetById(sy.preset)) ? sy.preset : s.preset,
      widthMm: num(sy.widthMm, s.widthMm, 30, 600),
      heightMm: num(sy.heightMm, s.heightMm, 20, 600),
    },
    filters: [],
    annotations: [],
  };

  for (const slot of ['x', 'y', 'color', 'size', 'facet', 'facetRow'] as EncodingSlot[]) {
    const col = resolveColumn(enc[slot], dataset);
    if (col) spec.enc[slot] = col;
  }

  if (Array.isArray(raw.filters)) {
    for (const f of raw.filters) {
      const column = resolveColumn(f?.column, dataset);
      if (!column) continue;
      const filter: Spec['filters'][number] = { column };
      if (Array.isArray(f.in)) filter.in = f.in.map(String);
      if (f.min !== undefined) filter.min = numOrNull(f.min);
      if (f.max !== undefined) filter.max = numOrNull(f.max);
      spec.filters.push(filter);
    }
  }

  if (Array.isArray(raw.annotations)) {
    for (const a of raw.annotations) {
      const value = numOrNull(a?.value);
      if (value === null || (a.kind !== 'hline' && a.kind !== 'vline')) continue;
      spec.annotations.push({ kind: a.kind, value, label: str(a.label) || undefined });
    }
  }

  return spec;
}

/** Apply a size preset: physical size + journal typography. */
export function applyPreset(style: Style, id: string): Style {
  const p = presetById(id);
  if (!p) return { ...style, preset: 'custom' };
  return { ...style, preset: p.id, widthMm: p.widthMm, heightMm: p.heightMm, fontSize: p.fontSize, font: p.font };
}

export const FONT_STACKS: Record<FontKind, string> = {
  sans: 'Helvetica, Arial, "Liberation Sans", sans-serif',
  serif: '"Times New Roman", Times, "Liberation Serif", serif',
  mono: '"Courier New", Courier, "Liberation Mono", monospace',
};

const UNITS: Record<string, string> = {
  ms: 'ms', s: 's', sec: 's', min: 'min', h: 'h', hr: 'h', hrs: 'h', d: 'd', days: 'd',
  mm: 'mm', cm: 'cm', m: 'm', km: 'km', um: 'µm', nm: 'nm',
  mg: 'mg', g: 'g', kg: 'kg', ug: 'µg', ml: 'mL', ul: 'µL', l: 'L',
  c: '°C', degc: '°C', k: 'K', pct: '%', percent: '%', perc: '%', hz: 'Hz', khz: 'kHz', mv: 'mV', v: 'V', w: 'W', kwh: 'kWh',
  mm2: 'mm²', m2: 'm²', mmhg: 'mmHg', bpm: 'bpm', usd: 'USD', eur: 'EUR', mol: 'mol', mm_l: 'mmol/L', um_l: 'µmol/L', au: 'a.u.',
};
const CASED_UNITS: Record<string, string> = {
  uM: 'µM', nM: 'nM', mM: 'mM', pM: 'pM', mL: 'mL', uL: 'µL', kDa: 'kDa', Da: 'Da',
  mmol_l: 'mmol/L', umol_l: 'µmol/L', nmol_l: 'nmol/L', mg_dl: 'mg/dL', g_l: 'g/L', mg_l: 'mg/L', ng_ml: 'ng/mL', ug_ml: 'µg/mL', pg_ml: 'pg/mL',
};
const ACRONYMS = new Set(['od600', 'od', 'ph', 'id', 'dna', 'rna', 'ldl', 'hdl', 'crp', 'il6', 'tnf', 'mri', 'eeg', 'ecg', 'fmri', 'rnaseq', 'bmi', 'gdp', 'co2', 'ci', 'sd', 'se', 'rt', 'iq', 'hr', 'bp', 'auc', 'pca', 'ec50', 'ic50', 'gfp', 'uv', 'rpm', 'cpu', 'gpu']);

const acronym = (w: string) => w.toUpperCase().replace('OD600', 'OD₆₀₀').replace('PH', 'pH').replace('CO2', 'CO₂');

/** Readable label from a column name: "stance_confidence" -> "Stance confidence", "rt_ms" -> "RT (ms)". */
export function prettify(name?: string): string {
  if (!name) return '';
  if (ACRONYMS.has(name.toLowerCase())) return acronym(name);
  // units whose case matters (uM ≠ um) or that span two tokens (mmol_l)
  const cased = name.match(/^(.*?)[_ .]+(uM|nM|mM|pM|mL|uL|kDa|Da|mmol_l|umol_l|nmol_l|mg_dl|g_l|mg_l|ng_ml|ug_ml|pg_ml)$/);
  if (cased && cased[1]) return `${prettify(cased[1])} (${CASED_UNITS[cased[2]]})`;
  const parts = name.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_.]+/).filter(Boolean);
  let unit = '';
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    const u = UNITS[last.toLowerCase()] ?? (last === 'C' ? '°C' : undefined);
    if (u) { unit = u; parts.pop(); }
  }
  const words = parts.map((w, i) => {
    if (ACRONYMS.has(w.toLowerCase())) return acronym(w);
    if (/^[A-Z0-9]{2,}$/.test(w) || /[A-Z].*[A-Z]/.test(w) || /^[^a-zA-Z]/.test(w)) return w;
    return i === 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase();
  });
  const label = words.join(' ');
  return unit ? `${label} (${unit})` : label;
}

/** "Stance confidence" -> "stance confidence", but "RT (ms)" stays as it is. */
export const lowerFirst = (label: string) => (/^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label);
