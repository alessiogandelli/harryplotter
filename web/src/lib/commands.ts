// Everything you can do, as a searchable list (⌘K) — and a small offline
// parser so short phrases like "log y" or "color by topic" work without AI.

import { MARKS, PALETTES, PRESETS, applyPreset, markInfo } from './spec';
import type { Dataset, EncodingSlot, Spec } from './types';

export interface Command {
  id: string;
  group: string;
  label: string;
  keywords?: string;
  /** returns the new spec, or a string naming an app action */
  run: (s: Spec) => Spec | `app:${string}`;
}

const set = (fn: (s: Spec) => void) => (s: Spec) => { const c = structuredClone(s); fn(c); return c; };

const SLOT_LABEL: Record<EncodingSlot, string> = { x: 'X axis', y: 'Y axis', color: 'Color by', size: 'Size by', facet: 'Panels by', facetRow: 'Rows of panels by' };

export function commands(dataset: Dataset | null, spec: Spec): Command[] {
  const out: Command[] = [];
  for (const m of MARKS) out.push({ id: `mark:${m.id}`, group: 'Chart', label: `${m.label} chart`, keywords: m.hint, run: set((s) => { s.mark = m.id; }) });

  if (dataset) {
    const slots = markInfo(spec.mark).slots;
    for (const slot of slots) {
      for (const c of dataset.columns) {
        out.push({ id: `enc:${slot}:${c.name}`, group: SLOT_LABEL[slot], label: `${SLOT_LABEL[slot]}: ${c.name}`, keywords: `${slot} ${c.type}`, run: set((s) => { s.enc[slot] = c.name; }) });
      }
      if (spec.enc[slot]) out.push({ id: `enc:${slot}:none`, group: SLOT_LABEL[slot], label: `Remove ${SLOT_LABEL[slot].toLowerCase()}`, run: set((s) => { delete s.enc[slot]; }) });
    }
    out.push({ id: 'swap', group: 'Chart', label: 'Swap X and Y', keywords: 'flip transpose', run: set((s) => { [s.enc.x, s.enc.y] = [s.enc.y, s.enc.x]; }) });
  }

  for (const [v, l] of [['none', 'No error bars'], ['sd', 'Error bars: SD'], ['se', 'Error bars: SE'], ['ci95', 'Error bars: 95% CI']] as const) {
    out.push({ id: `err:${v}`, group: 'Statistics', label: l, keywords: 'error bars confidence interval standard deviation standard error', run: set((s) => { s.stats.error = v; if (v !== 'none' && s.stats.aggregate === 'none') s.stats.aggregate = 'mean'; }) });
  }
  for (const [v, l] of [['linear', 'Linear regression'], ['loess', 'LOESS smooth'], ['none', 'No trend line']] as const) {
    out.push({ id: `trend:${v}`, group: 'Statistics', label: l, keywords: 'trend fit regression line smooth', run: set((s) => { s.stats.trend = v; }) });
  }
  out.push({ id: 'test', group: 'Statistics', label: spec.stats.test ? 'Hide statistical test' : 'Show statistical test (p-values)', keywords: 'significance t-test anova pearson p value stars', run: set((s) => { s.stats.test = !s.stats.test; }) });
  out.push({ id: 'points', group: 'Statistics', label: spec.stats.points ? 'Hide individual points' : 'Show individual points', keywords: 'raw data jitter observations', run: set((s) => { s.stats.points = !s.stats.points; }) });
  for (const a of ['mean', 'median', 'sum', 'count'] as const) out.push({ id: `agg:${a}`, group: 'Statistics', label: `Aggregate: ${a}`, run: set((s) => { s.stats.aggregate = a; }) });

  for (const ax of ['x', 'y'] as const) {
    const key = ax === 'x' ? 'xScale' : 'yScale';
    out.push({ id: `log:${ax}`, group: 'Axes', label: `Log scale ${ax.toUpperCase()}`, keywords: 'logarithmic', run: set((s) => { s.style[key] = 'log'; }) });
    out.push({ id: `lin:${ax}`, group: 'Axes', label: `Linear scale ${ax.toUpperCase()}`, run: set((s) => { s.style[key] = 'linear'; }) });
  }
  out.push({ id: 'zero', group: 'Axes', label: spec.style.zeroY ? 'Let Y start anywhere' : 'Start Y at zero', run: set((s) => { s.style.zeroY = !s.style.zeroY; }) });
  for (const g of ['none', 'y', 'x', 'both'] as const) out.push({ id: `grid:${g}`, group: 'Axes', label: `Grid: ${g}`, keywords: 'gridlines', run: set((s) => { s.style.grid = g; }) });

  for (const p of PALETTES) out.push({ id: `pal:${p.id}`, group: 'Colors', label: `Palette: ${p.label}`, keywords: `colors ${p.note ?? ''}`, run: set((s) => { s.style.palette = p.id; }) });
  for (const t of ['clean', 'classic', 'minimal', 'dark'] as const) out.push({ id: `theme:${t}`, group: 'Style', label: `Theme: ${t}`, run: set((s) => { s.style.theme = t; }) });
  for (const f of ['sans', 'serif', 'mono'] as const) out.push({ id: `font:${f}`, group: 'Style', label: `Font: ${f}`, run: set((s) => { s.style.font = f; }) });
  for (const l of ['auto', 'top', 'right', 'none'] as const) out.push({ id: `legend:${l}`, group: 'Style', label: l === 'none' ? 'Hide legend' : `Legend: ${l}`, run: set((s) => { s.style.legend = l; }) });
  for (const p of PRESETS) out.push({ id: `preset:${p.id}`, group: 'Size', label: `Size: ${p.label}`, keywords: `${p.group} journal ${p.widthMm}mm`, run: set((s) => { s.style = applyPreset(s.style, p.id); }) });

  out.push({ id: 'app:improve', group: 'Figure', label: 'Improve this plot', keywords: 'fix overlap ticks labels clean tidy polish', run: () => 'app:improve' });
  out.push({ id: 'app:ideas', group: 'Figure', label: 'Suggest what to plot from my data', keywords: 'ideas ai suggestions explore', run: () => 'app:ideas' });
  out.push({ id: 'app:export', group: 'Export', label: 'Export figure…', keywords: 'download pdf svg png tiff save', run: () => 'app:export' });
  out.push({ id: 'app:code', group: 'Export', label: 'Get Python / R code', keywords: 'matplotlib seaborn ggplot script reproduce', run: () => 'app:code' });
  out.push({ id: 'app:copy', group: 'Export', label: 'Copy image to clipboard', run: () => 'app:copy' });
  out.push({ id: 'app:data', group: 'View', label: 'Show data table', run: () => 'app:data' });
  out.push({ id: 'app:open', group: 'Data', label: 'Open another file…', run: () => 'app:open' });
  out.push({ id: 'app:reset', group: 'Chart', label: 'Start over with an automatic chart', keywords: 'reset auto', run: () => 'app:reset' });
  return out;
}

/** Fuzzy score: every query word must appear (prefix or substring) in label+keywords. */
export function score(cmd: Command, query: string): number {
  const hay = `${cmd.label} ${cmd.group} ${cmd.keywords ?? ''}`.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  let total = 0;
  for (const w of words) {
    const i = hay.indexOf(w);
    if (i < 0) return -1;
    total += i === 0 ? 3 : /\s/.test(hay[i - 1]) ? 2 : 1;
  }
  return total + (cmd.label.toLowerCase().startsWith(words[0] ?? '') ? 3 : 0);
}

// ---------------------------------------------------------------- offline phrases

function findColumn(dataset: Dataset, word: string): string | undefined {
  const w = word.toLowerCase().replace(/[^\w]/g, '');
  const norm = (s: string) => s.toLowerCase().replace(/[^\w]/g, '');
  return dataset.columns.find((c) => norm(c.name) === w)?.name
    ?? dataset.columns.find((c) => norm(c.name).startsWith(w) && w.length >= 3)?.name;
}

const MARK_WORDS: [RegExp, Spec['mark']][] = [
  [/\bscatter|dispersione\b/, 'scatter'], [/\bline|linea|time ?series\b/, 'line'], [/\barea\b/, 'area'],
  [/\bbar|barre|istogramma a barre\b/, 'bar'], [/\bhist(ogram)?|istogramma\b/, 'histogram'], [/\bdensity|kde|densit/, 'density'],
  [/\bbox ?plot|\bbox\b/, 'box'], [/\bviolin/, 'violin'], [/\bstrip|jitter|beeswarm|dot ?plot/, 'strip'],
  [/\bheat ?map/, 'heatmap'], [/\bcorrelation|correlazion|corr matrix/, 'corr'],
];

/**
 * Understand short instructions without a model. Returns the new spec and what
 * was understood, or null when nothing matched.
 */
export function quickIntent(text: string, spec: Spec, dataset: Dataset): { spec: Spec; understood: string[] } | null {
  const t = ` ${text.toLowerCase()} `;
  const s = structuredClone(spec);
  const said: string[] = [];

  const title = text.match(/\b(?:title|titolo)\s*[:=]\s*(.+)$/i);
  if (title) { s.style.title = title[1].trim(); said.push('title'); }

  for (const [re, m] of MARK_WORDS) if (re.test(t)) { s.mark = m; said.push(`${markInfo(m).label} chart`); break; }

  const slotPhrases: [RegExp, EncodingSlot][] = [
    [/\b(?:colou?r(?:ed)?|hue|group(?:ed)?|colora(?:to)?|per colore)\s*(?:by|per|=|:)?\s+([\w.-]+)/, 'color'],
    [/\b(?:facet(?:ed)?|split|panels?|pannelli|small multiples)\s*(?:by|per|=|:)?\s+([\w.-]+)/, 'facet'],
    [/\b(?:size|dimensione)\s*(?:by|per|=|:)?\s+([\w.-]+)/, 'size'],
    [/\bx\s*(?:=|:|is|axis|asse)\s*([\w.-]+)/, 'x'],
    [/\by\s*(?:=|:|is|axis|asse)\s*([\w.-]+)/, 'y'],
  ];
  for (const [re, slot] of slotPhrases) {
    const m = t.match(re);
    const col = m && findColumn(dataset, m[1]);
    if (col) { s.enc[slot] = col; said.push(`${SLOT_LABEL[slot].toLowerCase()} ${col}`); }
  }
  const vs = t.match(/\b([\w.-]+)\s+(?:vs\.?|versus|against|contro)\s+([\w.-]+)/);
  if (vs) {
    const a = findColumn(dataset, vs[1]), b = findColumn(dataset, vs[2]);
    if (a && b) { s.enc.y = a; s.enc.x = b; said.push(`${a} vs ${b}`); }
  }
  const by = t.match(/\b([\w.-]+)\s+(?:by|per|across)\s+([\w.-]+)/);
  if (by && !said.some((x) => x.includes(' vs '))) {
    const a = findColumn(dataset, by[1]), b = findColumn(dataset, by[2]);
    if (a && b && !/colou?r|facet|split|group/.test(by[1])) { s.enc.y = a; s.enc.x = b; said.push(`${a} by ${b}`); }
  }

  const logm = t.match(/\blog(?:arithmic)?\s*(?:scale\s*)?(?:on\s*)?(x|y|both)?\b|\b(x|y)\s*log/);
  if (logm) {
    const ax = logm[1] ?? logm[2] ?? 'y';
    if (ax === 'x' || ax === 'both') s.style.xScale = 'log';
    if (ax === 'y' || ax === 'both') s.style.yScale = 'log';
    said.push(`log ${ax}`);
  }

  if (/\b(sem?|standard error|errore standard)\b/.test(t)) { s.stats.error = 'se'; said.push('± SE'); }
  else if (/\b(sd|standard deviation|deviazione standard)\b/.test(t)) { s.stats.error = 'sd'; said.push('± SD'); }
  else if (/\b(ci|95|confidence|intervallo di confidenza|error ?bars?)\b/.test(t)) { s.stats.error = 'ci95'; said.push('± 95% CI'); }
  if (s.stats.error !== spec.stats.error && s.stats.aggregate === 'none' && (s.mark === 'bar' || s.mark === 'line')) s.stats.aggregate = 'mean';

  if (/\b(loess|lowess|smooth)/.test(t)) { s.stats.trend = 'loess'; said.push('LOESS'); }
  else if (/\b(regression|regressione|trend|fit|linear model|lm)\b/.test(t)) { s.stats.trend = 'linear'; said.push('linear fit'); }
  if (/\b(p.?values?|significan|t.?test|anova|stars|test)/.test(t)) { s.stats.test = true; said.push('statistical test'); }
  if (/\b(points|raw data|show (all )?data|punti|dati grezzi)\b/.test(t)) { s.stats.points = true; said.push('raw points'); }
  if (/\bstack(ed)?\b|impilat/.test(t)) { s.stats.barMode = 'stack'; said.push('stacked'); }
  if (/\b(percent|100%|proportion)/.test(t)) { s.stats.barMode = 'fill'; said.push('100% stacked'); }
  if (/\b(monthly|per month|mensile)\b/.test(t)) { s.stats.timeBin = 'month'; said.push('monthly'); }
  if (/\b(weekly|per week|settimanale)\b/.test(t)) { s.stats.timeBin = 'week'; said.push('weekly'); }
  if (/\b(yearly|annual|per year|annuale)\b/.test(t)) { s.stats.timeBin = 'year'; said.push('yearly'); }

  for (const p of PRESETS) {
    const key = p.id.split('-')[0];
    if (t.includes(` ${key}`) || t.includes(p.label.toLowerCase())) {
      const wide = /\b(2|two|double|full|due)\b/.test(t);
      const id = PRESETS.some((x) => x.id === `${key}-${wide ? 2 : 1}`) ? `${key}-${wide ? 2 : 1}` : p.id;
      s.style = applyPreset(s.style, id);
      said.push(PRESETS.find((x) => x.id === id)!.label);
      break;
    }
  }
  for (const p of PALETTES) if (t.includes(p.label.toLowerCase()) || t.includes(p.id)) { s.style.palette = p.id; said.push(`${p.label} palette`); break; }
  if (/colou?r.?blind|daltonic/.test(t)) { s.style.palette = 'okabe-ito'; said.push('colour-blind palette'); }
  if (/\b(gr[ae]yscale|black and white|bianco e nero|b\/w)\b/.test(t)) { s.style.palette = 'grayscale'; said.push('grayscale'); }
  if (/\b(dark|scuro)\b/.test(t)) { s.style.theme = 'dark'; said.push('dark theme'); }
  if (/\bclassic|boxed|frame\b/.test(t)) { s.style.theme = 'classic'; said.push('classic theme'); }
  if (/\b(serif|times)\b/.test(t)) { s.style.font = 'serif'; said.push('serif font'); }
  if (/\b(no legend|hide legend|senza legenda)\b/.test(t)) { s.style.legend = 'none'; said.push('no legend'); }
  if (/\blegend (on )?top\b/.test(t)) { s.style.legend = 'top'; said.push('legend on top'); }
  if (/\b(bigger|larger|più grand)\w* (font|text|testo)/.test(t)) { s.style.fontSize = Math.round(s.style.fontSize * 1.2); said.push('larger text'); }
  if (/\b(smaller|più piccol)\w* (font|text|testo)/.test(t)) { s.style.fontSize = Math.max(5, Math.round(s.style.fontSize / 1.2)); said.push('smaller text'); }

  return said.length ? { spec: s, understood: said } : null;
}
