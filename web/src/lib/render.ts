import * as Plot from '@observablehq/plot';
import * as d3 from 'd3';
import { applyFilters, columnOf, keyOf, levels } from './data';
import {
  CATEGORICAL_MARKS, FONT_STACKS, MM_TO_PX, PT_TO_PX, categoricalColors, lowerFirst, markInfo, prettify, sequentialScheme,
} from './spec';
import {
  anova, boxStats, formatP, kde, linearRegression, linspace, loess, mean, median, pearson, stars, summarize, welch,
} from './stats';
import type { Aggregate, Dataset, Row, Spec, ThemeKind } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface Theme { bg: string; ink: string; muted: string; axis: string; grid: string }

export const THEMES: Record<ThemeKind, Theme> = {
  clean: { bg: '#ffffff', ink: '#1d1d1f', muted: '#6b6b70', axis: '#3a3a3c', grid: '#e6e6e9' },
  classic: { bg: '#ffffff', ink: '#000000', muted: '#555555', axis: '#000000', grid: '#e4e4e4' },
  minimal: { bg: '#ffffff', ink: '#2b2b2e', muted: '#77777c', axis: '#c8c8cc', grid: '#ececef' },
  dark: { bg: '#15171c', ink: '#ececf1', muted: '#9a9aa5', axis: '#8a8a95', grid: '#2c2f37' },
};

export interface RenderResult {
  svg: SVGSVGElement | null;
  /** things the renderer decided on its own, shown to the user */
  notes: string[];
  /** reasons nothing (or less) could be drawn */
  warnings: string[];
}

interface Ctx {
  spec: Spec;
  rows: Row[];
  font: string;
  fontPx: number;
  theme: Theme;
  interactive: boolean;
  notes: string[];
  warnings: string[];
  /** categorical colour key per row, after folding rare levels into "Other" */
  colorKey?: (r: Row) => string;
  colorLevels: string[];
  colorRange: string[];
  colorNumeric: boolean;
}

// ---------------------------------------------------------------- text metrics

let measureCtx: CanvasRenderingContext2D | null = null;
export function textWidth(text: string, px: number, font: string, weight = 400): number {
  if (!measureCtx && typeof document !== 'undefined') measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * px * 0.56;
  measureCtx.font = `${weight} ${px}px ${font}`;
  return measureCtx.measureText(text).width;
}

const fmtNum = (v: number) => {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return d3.format('.2~e')(v);
  return d3.format(a >= 100 ? ',.0f' : a >= 1 ? ',.3~f' : '.3~g')(v);
};

// ---------------------------------------------------------------- entry point

export function render(spec: Spec, dataset: Dataset | null, opts: { interactive?: boolean } = {}): RenderResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  if (!dataset) return { svg: null, notes, warnings: ['Load a dataset to start.'] };

  const info = markInfo(spec.mark);
  const missing = info.required.filter((s) => !spec.enc[s]);
  if (missing.length) {
    return { svg: null, notes, warnings: [`${info.label} needs ${missing.map((m) => m.toUpperCase()).join(' and ')}.`] };
  }

  const st = spec.style;
  const theme = THEMES[st.theme];
  const font = FONT_STACKS[st.font];
  const fontPx = st.fontSize * PT_TO_PX;

  let rows = applyFilters(dataset.rows, spec.filters);
  // drop rows that cannot be placed
  const numericSlots = (['x', 'y', 'size'] as const).filter((s) => {
    const c = columnOf(dataset, spec.enc[s]);
    return c && (c.type === 'number' || c.type === 'date');
  });
  const usedSlots = info.slots.filter((s) => spec.enc[s]);
  const before = rows.length;
  rows = rows.filter((r) => usedSlots.every((s) => r[spec.enc[s]!] !== null && r[spec.enc[s]!] !== undefined));
  for (const [slot, scale] of [['x', st.xScale], ['y', st.yScale]] as const) {
    const col = spec.enc[slot];
    if (scale === 'log' && col && numericSlots.includes(slot)) rows = rows.filter((r) => (r[col] as number) > 0);
  }
  if (rows.length < before && spec.mark !== 'corr') notes.push(`${before - rows.length} rows without usable values left out`);
  if (!rows.length) return { svg: null, notes, warnings: ['No rows left to plot — check the filters.'] };

  const ctx: Ctx = {
    spec, rows, font, fontPx, theme, interactive: !!opts.interactive, notes, warnings,
    colorLevels: [], colorRange: [], colorNumeric: false,
  };
  setupColor(ctx, dataset);

  const W = st.widthMm * MM_TO_PX;
  const H = st.heightMm * MM_TO_PX;

  // ---- header / footer blocks
  const pad = Math.round(fontPx * 0.6);
  const titlePx = fontPx * 1.3;
  let top = pad;
  const header: { text: string; y: number; px: number; weight: number; color: string; field: string }[] = [];
  if (st.title) { top += titlePx; header.push({ text: st.title, y: top, px: titlePx, weight: 650, color: theme.ink, field: 'title' }); top += titlePx * 0.35; }
  if (st.subtitle) { top += fontPx * 1.05; header.push({ text: st.subtitle, y: top, px: fontPx * 1.05, weight: 400, color: theme.muted, field: 'subtitle' }); top += fontPx * 0.4; }
  if (header.length) top += fontPx * 0.5;
  const bottom = st.caption ? fontPx * 2.1 : pad * 0.5;

  // ---- legend
  const legend = buildLegend(ctx, W, H);
  let plotTop = top, plotW = W, plotH = H - top - bottom;
  if (legend?.position === 'top') { plotTop += legend.height; plotH -= legend.height; }
  if (legend?.position === 'right') plotW -= legend.width;

  const plotSvg = buildPlot(ctx, dataset, plotW, Math.max(60, plotH));
  if (!plotSvg) return { svg: null, notes, warnings };

  // ---- compose
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('font-family', font);
  svg.style.color = theme.ink;
  svg.style.background = theme.bg;
  svg.classList.add('hp-figure');

  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('width', String(W));
  bg.setAttribute('height', String(H));
  bg.setAttribute('fill', theme.bg);
  svg.appendChild(bg);

  for (const h of header) {
    const t = text(h.text, pad, h.y, h.px, h.color, h.weight);
    t.dataset.edit = h.field;
    svg.appendChild(t);
  }

  plotSvg.setAttribute('x', '0');
  plotSvg.setAttribute('y', String(plotTop));
  // Plot's own stylesheet sizes its root with `height: auto`, which a nested <svg> would read as 100%
  plotSvg.style.width = `${plotW}px`;
  plotSvg.style.height = `${Math.max(60, plotH)}px`;
  plotSvg.style.maxWidth = 'none';
  svg.appendChild(plotSvg);

  if (legend) {
    const g = legend.node;
    if (legend.position === 'top') g.setAttribute('transform', `translate(${legend.x ?? pad}, ${top})`);
    else g.setAttribute('transform', `translate(${plotW}, ${plotTop + Math.max(0, (plotH - legend.height) / 2 - fontPx)})`);
    svg.appendChild(g);
  }

  if (st.caption) {
    const c = text(st.caption, pad, H - fontPx * 0.8, fontPx * 0.88, theme.muted, 400);
    c.dataset.edit = 'caption';
    svg.appendChild(c);
  }
  // in the editor, axis labels can be edited in place too
  if (opts.interactive) {
    plotSvg.querySelector('[aria-label="x-axis label"]')?.setAttribute('data-edit', 'xLabel');
    plotSvg.querySelector('[aria-label="y-axis label"]')?.setAttribute('data-edit', 'yLabel');
  }

  return { svg, notes: [...new Set(notes)], warnings: [...new Set(warnings)] };
}

function text(content: string, x: number, y: number, px: number, color: string, weight: number) {
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  t.setAttribute('font-size', String(px));
  t.setAttribute('font-weight', String(weight));
  t.setAttribute('fill', color);
  t.textContent = content;
  return t;
}

// ---------------------------------------------------------------- colour

function setupColor(ctx: Ctx, dataset: Dataset) {
  const col = ctx.spec.enc.color;
  const info = markInfo(ctx.spec.mark);
  if (!col || !info.slots.includes('color')) return;
  const c = columnOf(dataset, col);
  if (c?.type === 'number' && !CATEGORICAL_MARKS.includes(ctx.spec.mark) && ctx.spec.mark !== 'histogram' && ctx.spec.mark !== 'density') {
    ctx.colorNumeric = true;
    return;
  }
  const palette = categoricalColors(ctx.spec.style.palette);
  let lv = levels(ctx.rows, col);
  let map: Map<string, string> | null = null;
  if (lv.length > palette.length) {
    // fixed hue order is never cycled: rare levels fold into "Other"
    const counts = d3.rollup(ctx.rows, (v) => v.length, (r) => keyOf(r[col]));
    const keep = new Set([...counts].sort((a, b) => b[1] - a[1]).slice(0, palette.length - 1).map((d) => d[0]));
    map = new Map(lv.map((l) => [l, keep.has(l) ? l : 'Other']));
    ctx.notes.push(`${lv.length - keep.size} rare ${lowerFirst(prettify(col))} values grouped as “Other”`);
    lv = [...lv.filter((l) => keep.has(l)), 'Other'];
  }
  ctx.colorLevels = lv;
  ctx.colorRange = lv.map((l, i) => (l === 'Other' && map ? '#a3a3a8' : palette[i % palette.length]));
  ctx.colorKey = map ? (r) => map!.get(keyOf(r[col]))! : (r) => keyOf(r[col]);
}

const colorOf = (ctx: Ctx, key: string) => ctx.colorRange[ctx.colorLevels.indexOf(key)] ?? categoricalColors(ctx.spec.style.palette)[0];

// ---------------------------------------------------------------- legend

interface Legend { node: SVGGElement; position: 'top' | 'right'; width: number; height: number; x?: number }

function buildLegend(ctx: Ctx, W: number, H: number): Legend | null {
  const { spec, fontPx, font, theme } = ctx;
  if (spec.style.legend === 'none') return null;
  const title = spec.style.colorLabel || prettify(spec.enc.color);
  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  const pad = Math.round(fontPx * 0.6);

  // continuous colour: a horizontal ramp from Plot, top right
  const continuous = ctx.colorNumeric || spec.mark === 'heatmap' || spec.mark === 'corr';
  if (continuous) {
    const domain = spec.mark === 'corr' ? [-1, 1] : undefined;
    const label = spec.mark === 'corr' ? 'Pearson r' : spec.mark === 'heatmap' ? heatmapValueLabel(spec) : title;
    const scheme = spec.mark === 'corr' ? 'rdbu' : sequentialScheme(spec.style.palette);
    const width = Math.min(220, W * 0.35);
    const ramp = Plot.legend({
      color: { type: 'linear', scheme: scheme as any, domain: domain ?? colorDomain(ctx), label },
      width, height: fontPx * 3.4, marginLeft: 2, marginRight: 8, ticks: 4, tickSize: 4,
      style: { fontFamily: font, fontSize: `${fontPx * 0.9}px`, color: theme.ink, background: 'transparent' } as any,
    }) as SVGSVGElement;
    g.appendChild(ramp);
    return { node: g, position: 'top', width, height: fontPx * 3.6, x: W - width - pad };
  }

  if (ctx.colorLevels.length < 2) return null;
  const sw = fontPx * 0.75;
  const gap = fontPx * 0.45;
  const items = ctx.colorLevels.map((l) => ({ l, w: sw + gap + textWidth(l, fontPx, font) }));
  const titleW = textWidth(title, fontPx, font, 600);
  const rowWidth = titleW + fontPx + items.reduce((s, i) => s + i.w + fontPx * 1.1, 0);
  const position = spec.style.legend === 'auto' ? (rowWidth < W - 2 * pad ? 'top' : 'right') : spec.style.legend;
  const line = (spec.mark === 'line' || spec.mark === 'density') && !spec.stats.points;

  const swatch = (x: number, y: number, color: string) => {
    if (line) {
      const l = document.createElementNS(SVG_NS, 'line');
      l.setAttribute('x1', String(x)); l.setAttribute('x2', String(x + sw));
      l.setAttribute('y1', String(y)); l.setAttribute('y2', String(y));
      l.setAttribute('stroke', color); l.setAttribute('stroke-width', String(Math.max(1.5, spec.style.lineWidth)));
      l.setAttribute('stroke-linecap', 'round');
      return l;
    }
    if (spec.mark === 'scatter' || spec.mark === 'strip') {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', String(x + sw / 2)); c.setAttribute('cy', String(y)); c.setAttribute('r', String(sw * 0.42));
      c.setAttribute('fill', color);
      return c;
    }
    const r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('x', String(x)); r.setAttribute('y', String(y - sw / 2));
    r.setAttribute('width', String(sw)); r.setAttribute('height', String(sw)); r.setAttribute('rx', String(sw * 0.2));
    r.setAttribute('fill', color);
    return r;
  };

  if (position === 'top') {
    let x = 0;
    const y = fontPx * 0.9;
    if (title) { const t = text(title, x, y + fontPx * 0.35, fontPx, theme.ink, 600); t.dataset.edit = 'colorLabel'; g.appendChild(t); x += titleW + fontPx; }
    for (const it of items) {
      g.appendChild(swatch(x, y, colorOf(ctx, it.l)));
      g.appendChild(text(it.l, x + sw + gap, y + fontPx * 0.35, fontPx, theme.ink, 400));
      x += it.w + fontPx * 1.1;
    }
    return { node: g, position: 'top', width: x, height: fontPx * 2.2 };
  }

  const lh = fontPx * 1.45;
  let y = fontPx;
  if (title) { const t = text(title, pad, y, fontPx, theme.ink, 600); t.dataset.edit = 'colorLabel'; g.appendChild(t); y += lh; }
  for (const it of items) {
    g.appendChild(swatch(pad, y - fontPx * 0.35, colorOf(ctx, it.l)));
    g.appendChild(text(it.l, pad + sw + gap, y, fontPx, theme.ink, 400));
    y += lh;
  }
  const width = Math.max(titleW, ...items.map((i) => i.w)) + 2 * pad + fontPx * 0.5;
  return { node: g, position: 'right', width: Math.min(width, W * 0.4), height: y };
}

function colorDomain(ctx: Ctx): [number, number] {
  const col = ctx.spec.enc.color!;
  const ext = d3.extent(ctx.rows, (r) => r[col] as number);
  return [ext[0] ?? 0, ext[1] ?? 1];
}

// ---------------------------------------------------------------- the plot

type Mark = Plot.Markish;

interface Layout {
  marks: Mark[];
  x?: Plot.ScaleOptions;
  y?: Plot.ScaleOptions;
  color?: Plot.ScaleOptions;
  r?: Plot.ScaleOptions;
  xLabel: string;
  yLabel: string;
  /** tick labels of the x axis (for margin estimates) */
  xTickLabels?: string[];
  yTickLabels?: string[];
  gridX?: boolean;
}

function buildPlot(ctx: Ctx, dataset: Dataset, width: number, height: number): SVGSVGElement | null {
  const { spec, fontPx, font, theme } = ctx;
  const st = spec.style;

  let layout: Layout | null;
  switch (spec.mark) {
    case 'scatter': layout = scatter(ctx, dataset); break;
    case 'line': case 'area': layout = lineArea(ctx, dataset); break;
    case 'histogram': layout = histogram(ctx); break;
    case 'density': layout = density(ctx); break;
    case 'bar': case 'box': case 'violin': case 'strip': layout = categorical(ctx, dataset); break;
    case 'heatmap': layout = heatmap(ctx, dataset); break;
    case 'corr': layout = corr(ctx, dataset); break;
    default: layout = null;
  }
  if (!layout) return null;

  const facetX = spec.mark !== 'corr' ? spec.enc.facet : undefined;
  const facetY = spec.mark !== 'corr' && spec.mark !== 'heatmap' ? spec.enc.facetRow : undefined;
  const xLabel = st.xLabel || layout.xLabel;
  const yLabel = st.yLabel || layout.yLabel;

  // ---- margins from real text widths
  const tickSize = st.theme === 'minimal' ? 0 : 4;
  const tickPad = Math.round(fontPx * 0.35);
  const tickPx = fontPx * 0.92;
  const yTicks = layout.yTickLabels ?? guessTicks(ctx, 'y', layout);
  const yTickW = Math.max(0, ...yTicks.map((t) => textWidth(t, tickPx, font)));
  const marginLeft = Math.ceil(yTickW + tickSize + tickPad + (yLabel ? fontPx * 1.9 : fontPx * 0.6) + 2);

  const xTicks = layout.xTickLabels ?? [];
  const nx = Math.max(1, xTicks.length);
  const maxXTick = Math.max(0, ...xTicks.map((t) => textWidth(t, tickPx, font)));
  const facetCount = facetX ? levels(ctx.rows, facetX).length : 1;
  const slot = (width - marginLeft) / facetCount / nx;
  const rotate = xTicks.length > 0 && maxXTick > slot * 0.92 ? -35 : 0;
  const xTickH = rotate ? maxXTick * Math.sin(Math.PI / 180 * 35) + tickPx * 0.9 : tickPx * 1.15;
  const marginBottom = Math.ceil(tickSize + tickPad + xTickH + (xLabel ? fontPx * 1.75 : fontPx * 0.4));
  const marginTop = Math.ceil((facetX ? fontPx * 1.9 : 0) + fontPx * 0.8);
  const marginRight = Math.ceil(facetY ? fontPx * 2.2 : fontPx * 1.2);

  const marks: Mark[] = [];
  // grid first so it sits under the data
  const gridY = st.grid === 'y' || st.grid === 'both';
  const gridX = (st.grid === 'x' || st.grid === 'both') && layout.gridX !== false;
  if (gridY && spec.mark !== 'heatmap' && spec.mark !== 'corr') marks.push(Plot.gridY({ stroke: theme.grid, strokeOpacity: 1, strokeWidth: 0.8 }));
  if (gridX && spec.mark !== 'heatmap' && spec.mark !== 'corr') marks.push(Plot.gridX({ stroke: theme.grid, strokeOpacity: 1, strokeWidth: 0.8 }));
  marks.push(...layout.marks);

  // reference lines
  for (const a of spec.annotations) {
    const dash = { stroke: theme.muted, strokeWidth: 1, strokeDasharray: '4,3' };
    if (a.kind === 'hline') {
      marks.push(Plot.ruleY([a.value], dash));
      if (a.label) marks.push(Plot.text([a.value], { y: (d: number) => d, text: () => a.label!, frameAnchor: 'right', textAnchor: 'end', dy: -fontPx * 0.6, fill: theme.muted, fontSize: fontPx * 0.9, ...halo(theme) }));
    } else {
      marks.push(Plot.ruleX([a.value], dash));
      if (a.label) marks.push(Plot.text([a.value], { x: (d: number) => d, text: () => a.label!, frameAnchor: 'top', textAnchor: 'start', dx: 4, dy: 4, fill: theme.muted, fontSize: fontPx * 0.9, ...halo(theme) }));
    }
  }

  // axis lines per theme
  if (st.theme === 'classic') marks.push(Plot.frame({ stroke: theme.axis, strokeWidth: 0.9 }));
  else if (st.theme !== 'minimal' && spec.mark !== 'heatmap' && spec.mark !== 'corr') {
    marks.push(Plot.frame({ anchor: 'bottom', stroke: theme.axis, strokeWidth: 0.9 }));
    marks.push(Plot.frame({ anchor: 'left', stroke: theme.axis, strokeWidth: 0.9 }));
  }

  const axisCommon = { tickSize, tickPadding: tickPad, labelArrow: 'none' as const, labelAnchor: 'center' as const };

  const x: Plot.ScaleOptions = {
    ...axisCommon,
    label: xLabel || null,
    labelOffset: marginBottom - fontPx * 0.45,
    tickRotate: rotate,
    ...(layout.x ?? {}),
  };
  const y: Plot.ScaleOptions = {
    ...axisCommon,
    label: yLabel || null,
    labelOffset: marginLeft - fontPx * 0.35,
    ...(layout.y ?? {}),
  };
  if (st.xMin !== null || st.xMax !== null) {
    if (layout.x?.type !== 'point' && layout.x?.type !== 'band') {
      x.domain = [st.xMin ?? (x.domain as number[] | undefined)?.[0] ?? (d3.min(ctx.rows, (r) => r[spec.enc.x!] as number) as number),
        st.xMax ?? (x.domain as number[] | undefined)?.[1] ?? (d3.max(ctx.rows, (r) => r[spec.enc.x!] as number) as number)];
      x.clamp = false;
    }
  }
  if (st.yMin !== null || st.yMax !== null) {
    const auto = (y.domain as number[] | undefined) ?? [undefined, undefined];
    const yCol = spec.enc.y;
    y.domain = [st.yMin ?? auto[0] ?? (yCol ? (d3.min(ctx.rows, (r) => r[yCol] as number) as number) : 0),
      st.yMax ?? auto[1] ?? (yCol ? (d3.max(ctx.rows, (r) => r[yCol] as number) as number) : 1)];
  }

  try {
    const svg = Plot.plot({
      width, height,
      marginLeft, marginBottom, marginTop, marginRight,
      style: { fontFamily: font, fontSize: `${tickPx}px`, color: theme.ink, background: 'transparent', overflow: 'visible' } as any,
      x, y,
      color: layout.color,
      r: layout.r,
      // panels come from each mark's fx/fy channel; unfaceted marks (grid, frame) repeat in every panel
      fx: facetX ? { label: null, axis: 'top', tickSize: 0, tickPadding: fontPx * 0.6, padding: 0.08, domain: facetDomain(ctx, facetX), tickFormat: facetFormat(dataset, facetX) } : undefined,
      fy: facetY ? { label: null, axis: 'right', tickSize: 0, tickPadding: fontPx * 0.5, padding: 0.1, domain: facetDomain(ctx, facetY), tickFormat: facetFormat(dataset, facetY) } : undefined,
      marks,
    } as Plot.PlotOptions) as unknown as SVGSVGElement;
    if (svg.tagName.toLowerCase() !== 'svg') throw new Error('Unexpected Plot output');
    return svg;
  } catch (e) {
    ctx.warnings.push(`Could not draw this combination: ${(e as Error).message}`);
    return null;
  }
}

/** Panels in natural order (pre before post, 1 before 10), keeping the raw values Plot sees. */
function facetDomain(ctx: Ctx, col: string): unknown[] {
  const byKey = new Map<string, unknown>();
  for (const r of ctx.rows) { const k = keyOf(r[col]); if (!byKey.has(k)) byKey.set(k, r[col]); }
  return levels(ctx.rows, col).map((l) => byKey.get(l));
}

/** Numeric panel values need their column name ("Temperature (°C) = 30"), words don't. */
function facetFormat(dataset: Dataset, col: string) {
  const c = columnOf(dataset, col);
  if (c?.type === 'number') return (v: unknown) => `${prettify(col)} = ${v}`;
  if (c?.type === 'date') return (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
  return undefined;
}

/** Rough y tick labels for margin estimates on continuous axes. */
function guessTicks(ctx: Ctx, axis: 'y', layout: Layout): string[] {
  const dom = layout.y?.domain as number[] | undefined;
  let lo: number | undefined, hi: number | undefined;
  if (dom && typeof dom[0] === 'number') [lo, hi] = dom as [number, number];
  else if (ctx.spec.enc[axis]) {
    const col = ctx.spec.enc[axis]!;
    const vals = ctx.rows.map((r) => r[col]).filter((v): v is number => typeof v === 'number');
    if (vals.length) { lo = d3.min(vals); hi = d3.max(vals); }
  }
  if (lo === undefined || hi === undefined) return ['0000'];
  if (layout.y?.percent) return ['100'];
  const ticks = d3.scaleLinear().domain([lo, hi]).nice().ticks(6);
  const f = d3.scaleLinear().domain([lo, hi]).tickFormat(6);
  return ticks.map(f);
}

// ---------------------------------------------------------------- helpers for marks

const facetKeys = (ctx: Ctx) => {
  const fx = ctx.spec.enc.facet, fy = ctx.spec.enc.facetRow;
  return (r: Row) => `${fx ? keyOf(r[fx]) : ''}\u0001${fy ? keyOf(r[fy]) : ''}`;
};

/** Group rows by facet + colour, keeping the first row of each group for its facet values. */
function groupsOf(ctx: Ctx, extra?: (r: Row) => string) {
  const fk = facetKeys(ctx);
  const ck = ctx.colorKey ?? (() => '');
  return d3.groups(ctx.rows, (r) => `${fk(r)}\u0001${ck(r)}${extra ? `\u0001${extra(r)}` : ''}`).map(([key, rows]) => ({
    key, rows, color: ck(rows[0]),
    facet: { ...(ctx.spec.enc.facet ? { [ctx.spec.enc.facet]: rows[0][ctx.spec.enc.facet] } : {}), ...(ctx.spec.enc.facetRow ? { [ctx.spec.enc.facetRow]: rows[0][ctx.spec.enc.facetRow] } : {}) },
  }));
}

const facetChannels = (ctx: Ctx) => ({
  ...(ctx.spec.enc.facet ? { fx: ctx.spec.enc.facet } : {}),
  ...(ctx.spec.enc.facetRow ? { fy: ctx.spec.enc.facetRow } : {}),
});

/** A background-coloured outline so labels stay readable on top of data. */
const halo = (theme: Theme) => ({ stroke: theme.bg, strokeWidth: 3, strokeOpacity: 0.85, paintOrder: 'stroke' });

const scaleType = (s: string) => (s === 'linear' ? undefined : (s as 'log' | 'sqrt'));

const aggregate = (vals: number[], agg: Aggregate): number => {
  switch (agg) {
    case 'sum': return d3.sum(vals);
    case 'median': return median(vals);
    case 'min': return d3.min(vals) ?? NaN;
    case 'max': return d3.max(vals) ?? NaN;
    case 'count': return vals.length;
    default: return mean(vals);
  }
};

const TIME_UNITS = { day: d3.utcDay, week: d3.utcMonday, month: d3.utcMonth, quarter: { floor: (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1)) }, year: d3.utcYear } as const;

const AGG_LABEL: Record<Aggregate, string> = { none: '', mean: 'Mean', median: 'Median', sum: 'Total', count: 'Count', min: 'Min', max: 'Max' };
const ERR_LABEL = { none: '', sd: '± SD', se: '± SE', ci95: '± 95% CI' };

function aggLabel(agg: Aggregate, col: string | undefined, err: keyof typeof ERR_LABEL) {
  if (agg === 'count' || !col) return 'Count';
  const base = agg === 'none' ? prettify(col) : `${AGG_LABEL[agg]} ${lowerFirst(prettify(col))}`;
  return agg === 'mean' && err !== 'none' ? `${base} (${ERR_LABEL[err]})` : base;
}

function colorChannel(ctx: Ctx): Partial<Plot.ScaleOptions> | undefined {
  if (ctx.colorNumeric) return { type: 'linear', scheme: sequentialScheme(ctx.spec.style.palette) as any };
  if (ctx.colorLevels.length) return { domain: ctx.colorLevels, range: ctx.colorRange };
  return undefined;
}

const single = (ctx: Ctx) => categoricalColors(ctx.spec.style.palette)[0];

const tip = (ctx: Ctx, extra: object = {}) => (ctx.interactive ? { tip: { fontSize: ctx.fontPx * 0.95, ...extra } } : {});

// ---------------------------------------------------------------- scatter

const isCategorical = (d: Dataset, col: string) => { const t = columnOf(d, col)?.type; return t === 'category' || t === 'text'; };

function scatter(ctx: Ctx, dataset: Dataset): Layout {
  const { spec } = ctx;
  const { x, y, color, size } = spec.enc;
  const st = spec.style;
  const fill = color ? (ctx.colorNumeric ? color : (r: Row) => ctx.colorKey!(r)) : single(ctx);
  const marks: Mark[] = [];
  const dark = st.theme === 'dark';
  marks.push(Plot.dot(ctx.rows, {
    x, y, fill, ...facetChannels(ctx),
    r: size ?? st.markSize,
    fillOpacity: size ? Math.min(st.opacity, 0.6) : st.opacity,
    stroke: dark ? '#15171c' : '#ffffff', strokeWidth: 0.5, strokeOpacity: 0.9,
    channels: color && !ctx.colorNumeric ? { [prettify(color)]: (r: Row) => keyOf(r[color]) } : undefined,
    ...tip(ctx),
  } as Plot.DotOptions));
  if (size) {
    const [lo, hi] = d3.extent(ctx.rows, (r) => r[size] as number) as [number, number];
    ctx.notes.push(`Dot area: ${lowerFirst(prettify(size))} (${fmtNum(lo)}–${fmtNum(hi)})`);
  }
  const xCat = isCategorical(dataset, x!), yCat = isCategorical(dataset, y!);
  if ((spec.stats.trend !== 'none' || spec.stats.test) && !xCat && !yCat) addTrends(ctx, marks, x!, y!);
  return {
    marks,
    x: xCat ? { type: 'point', domain: levels(ctx.rows, x!), padding: 0.5 } : { type: scaleType(st.xScale), nice: true },
    y: yCat ? { type: 'point', domain: levels(ctx.rows, y!), padding: 0.5 } : { type: scaleType(st.yScale), nice: true, zero: st.zeroY || undefined },
    color: colorChannel(ctx),
    r: size ? { type: 'sqrt', domain: d3.extent(ctx.rows, (r) => r[size] as number) as [number, number], range: [st.markSize * 0.5, st.markSize * 2.4] } : undefined,
    xLabel: prettify(x),
    yLabel: prettify(y),
  };
}

function addTrends(ctx: Ctx, marks: Mark[], x: string, y: string) {
  const { spec, theme, fontPx } = ctx;
  const groups = groupsOf(ctx);
  const showTest = spec.stats.test;
  const lines: Row[] = [], bands: Row[] = [], labels: Row[] = [];
  const facetIndex = new Map<string, number>();
  const numeric = (v: unknown) => (v instanceof Date ? v.getTime() : (v as number));
  const isDate = ctx.rows[0]?.[x] instanceof Date;
  for (const g of groups) {
    const xs = g.rows.map((r) => numeric(r[x])), ys = g.rows.map((r) => r[y] as number);
    const facetKey = g.key.split('\u0001').slice(0, 2).join('|');
    const back = (v: number) => (isDate ? new Date(v) : v);
    const trend = spec.stats.trend === 'none' ? 'linear' : spec.stats.trend;
    const reg = linearRegression(xs, ys);
    if (spec.stats.trend !== 'none') {
      if (trend === 'linear' && reg) {
        for (const p of reg.band) {
          lines.push({ ...g.facet, __x: back(p.x), __y: p.y, __c: g.color, __k: g.key });
          bands.push({ ...g.facet, __x: back(p.x), __lo: p.lo, __hi: p.hi, __c: g.color, __k: g.key });
        }
      } else if (trend === 'loess') {
        for (const p of loess(xs, ys)) lines.push({ ...g.facet, __x: back(p.x), __y: p.y, __c: g.color, __k: g.key });
      }
    }
    if (showTest && reg && Number.isFinite(reg.r)) {
      const i = facetIndex.get(facetKey) ?? 0;
      facetIndex.set(facetKey, i + 1);
      labels.push({ ...g.facet, __t: g.color ? `r = ${reg.r.toFixed(2)}, ${formatP(reg.p)}` : `r = ${reg.r.toFixed(2)}, ${formatP(reg.p)}, n = ${reg.n}`, __i: i, __c: g.color });
    }
  }
  const strokeOf = (r: Row) => (ctx.colorKey ? colorOf(ctx, r.__c as string) : theme.ink);
  if (bands.length) marks.push(Plot.areaY(bands, { x: '__x', y1: '__lo', y2: '__hi', z: '__k', fill: (r: Row) => strokeOf(r), fillOpacity: 0.14, ...facetChannels(ctx) }));
  if (lines.length) marks.push(Plot.line(lines, { x: '__x', y: '__y', z: '__k', stroke: (r: Row) => strokeOf(r), strokeWidth: spec.style.lineWidth * 1.1, ...facetChannels(ctx) }));
  for (const l of labels) {
    marks.push(Plot.text([l], {
      text: '__t', frameAnchor: 'top-left', dx: fontPx * 0.5, dy: fontPx * 0.4 + (l.__i as number) * fontPx * 1.3,
      fill: l.__c ? colorOf(ctx, l.__c as string) : theme.ink, fontSize: fontPx * 0.9, textAnchor: 'start', lineAnchor: 'top', ...halo(theme),
      ...facetChannels(ctx),
    }));
  }
}

// ---------------------------------------------------------------- line & area

function lineArea(ctx: Ctx, dataset: Dataset): Layout {
  const { spec } = ctx;
  const { x, y } = spec.enc;
  const st = spec.style;
  const xCol = columnOf(dataset, x)!;
  const groups = groupsOf(ctx);
  const binned = xCol.type === 'date' && spec.stats.timeBin !== 'none';
  const dupes = binned || groups.some((g) => new Set(g.rows.map((r) => keyOf(r[x!]))).size < g.rows.length);
  const agg: Aggregate = spec.stats.aggregate !== 'none' ? spec.stats.aggregate : dupes ? 'mean' : 'none';
  if (spec.stats.aggregate === 'none' && dupes) ctx.notes.push(binned ? `${AGG_LABEL.mean} per ${spec.stats.timeBin}` : `Several rows share the same ${lowerFirst(prettify(x))}: showing the mean`);
  const err = agg === 'mean' ? spec.stats.error : 'none';

  const bin = xCol.type === 'date' && spec.stats.timeBin !== 'none' ? TIME_UNITS[spec.stats.timeBin] : null;
  const xValue = (r: Row) => (bin ? bin.floor(r[x!] as Date) : r[x!]);
  const pts: Row[] = [];
  for (const g of groups) {
    const byX = d3.groups(g.rows, (r) => keyOf(xValue(r)));
    for (const [, rs] of byX) {
      const vals = rs.map((r) => r[y!] as number);
      const s = agg === 'mean' ? summarize(vals, err) : null;
      pts.push({ ...g.facet, __x: xValue(rs[0]), __y: s ? s.mean : aggregate(vals, agg === 'none' ? 'mean' : agg), __lo: s?.lo, __hi: s?.hi, __c: g.color, __k: g.key, __n: vals.length });
    }
  }
  const order = xCol.type === 'category' || xCol.type === 'text' ? levels(ctx.rows, x!) : null;
  pts.sort((a, b) => (order ? order.indexOf(keyOf(a.__x)) - order.indexOf(keyOf(b.__x)) : (a.__x as number) - (b.__x as number)));

  const c = ctx.colorKey ? (r: Row) => r.__c as string : undefined;
  const fixed = single(ctx);
  const marks: Mark[] = [];
  const f = facetChannels(ctx);
  if (spec.mark === 'area') {
    marks.push(Plot.areaY(pts, { x: '__x', y: '__y', z: '__k', fill: c ?? fixed, fillOpacity: Math.min(0.9, st.opacity), ...f }));
    marks.push(Plot.lineY(pts, { x: '__x', y: '__y', z: '__k', stroke: c ?? fixed, strokeWidth: st.lineWidth * 0.6, ...(c ? Plot.stackY({ x: '__x', y: '__y', z: '__k' }) : {}), ...f } as any));
  } else {
    if (err !== 'none') marks.push(Plot.areaY(pts, { x: '__x', y1: '__lo', y2: '__hi', z: '__k', fill: c ?? fixed, fillOpacity: 0.16, ...f }));
    marks.push(Plot.line(pts, { x: '__x', y: '__y', z: '__k', stroke: c ?? fixed, strokeWidth: st.lineWidth, strokeLinejoin: 'round', strokeLinecap: 'round', ...f }));
    if (spec.stats.points) marks.push(Plot.dot(pts, { x: '__x', y: '__y', fill: c ?? fixed, r: st.markSize * 0.8, stroke: st.theme === 'dark' ? '#15171c' : '#fff', strokeWidth: 0.75, ...f }));
  }
  if (ctx.interactive) {
    marks.push(Plot.tip(pts, Plot.pointer({
      x: '__x', y: '__y', ...f,
      title: (r: Row) => `${prettify(x)}: ${fmtVal(r.__x)}\n${aggLabel(agg, y, 'none')}: ${fmtNum(r.__y as number)}${r.__lo !== undefined && err !== 'none' ? ` [${fmtNum(r.__lo as number)}, ${fmtNum(r.__hi as number)}]` : ''}${r.__c ? `\n${prettify(spec.enc.color)}: ${r.__c}` : ''}\nn = ${r.__n}`,
      fontSize: ctx.fontPx * 0.95,
    } as any)));
  }
  if (spec.stats.trend !== 'none' || spec.stats.test) addTrends(ctx, marks, x!, y!);
  return {
    marks,
    x: { type: order ? 'point' : scaleType(st.xScale), ...(order ? { domain: order, padding: 0.3 } : { nice: false }) },
    y: { type: scaleType(st.yScale), nice: true, zero: spec.mark === 'area' || st.zeroY || undefined },
    color: colorChannel(ctx),
    xLabel: prettify(x),
    yLabel: aggLabel(agg, y, err),
    gridX: !order,
  };
}

const fmtVal = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'number' ? fmtNum(v) : String(v));

// ---------------------------------------------------------------- distributions

function histogram(ctx: Ctx): Layout {
  const { spec } = ctx;
  const { x } = spec.enc;
  const st = spec.style;
  const c = ctx.colorKey;
  const mode = c ? spec.stats.barMode : 'stack';
  const opts = { x, fill: c ?? single(ctx), thresholds: spec.stats.bins, inset: 0.5, ...facetChannels(ctx), ...tip(ctx) };
  const marks: Mark[] = [];
  if (mode === 'group') {
    // overlay: y2 instead of y so groups are not stacked
    // overlay: faint fills plus a crisp step outline per group, so every distribution stays readable
    marks.push(Plot.rectY(ctx.rows, Plot.binX({ y2: 'count' }, { ...opts, fillOpacity: 0.16, tip: undefined } as any)));
    marks.push(Plot.lineY(ctx.rows, Plot.binX({ y: 'count', x: 'x1', filter: null }, { x, stroke: c, z: c, thresholds: spec.stats.bins, curve: 'step-after', strokeWidth: st.lineWidth * 0.8, ...facetChannels(ctx), ...tip(ctx) } as any)));
  } else {
    marks.push(Plot.rectY(ctx.rows, Plot.binX({ y: 'count' }, { ...opts, fillOpacity: Math.max(0.85, st.opacity), offset: mode === 'fill' ? 'normalize' : undefined } as any)));
  }
  return {
    marks,
    x: { type: scaleType(st.xScale), nice: true },
    y: { type: scaleType(st.yScale), zero: true, nice: true, percent: mode === 'fill' },
    color: colorChannel(ctx),
    xLabel: prettify(x),
    yLabel: mode === 'fill' ? 'Share (%)' : 'Count',
    gridX: false,
    yTickLabels: undefined,
  };
}

function density(ctx: Ctx): Layout {
  const { spec } = ctx;
  const { x } = spec.enc;
  const st = spec.style;
  const vals = ctx.rows.map((r) => r[x!] as number);
  const [lo, hi] = d3.extent(vals) as [number, number];
  const span = hi - lo || 1;
  const grid = linspace(lo - span * 0.08, hi + span * 0.08, 160);
  const pts: Row[] = [];
  for (const g of groupsOf(ctx)) {
    const d = kde(g.rows.map((r) => r[x!] as number), grid);
    grid.forEach((gx, i) => pts.push({ ...g.facet, __x: gx, __d: d[i], __c: g.color, __k: g.key }));
  }
  const c = ctx.colorKey ? (r: Row) => r.__c as string : single(ctx);
  const f = facetChannels(ctx);
  const marks: Mark[] = [
    Plot.areaY(pts, { x: '__x', y2: '__d', z: '__k', fill: c, fillOpacity: 0.22, ...f }),
    Plot.line(pts, { x: '__x', y: '__d', z: '__k', stroke: c, strokeWidth: st.lineWidth, ...f }),
  ];
  if (spec.stats.points) {
    const rugH = (d3.max(pts, (p) => p.__d as number) ?? 1) * 0.045;
    marks.push(Plot.ruleX(ctx.rows, { x, y1: 0, y2: rugH, stroke: ctx.colorKey ? (r: Row) => ctx.colorKey!(r) : single(ctx), strokeOpacity: 0.5, strokeWidth: 0.8, ...f }));
  }
  return {
    marks,
    x: { type: scaleType(st.xScale), nice: true },
    y: { zero: true, nice: true },
    color: colorChannel(ctx),
    xLabel: prettify(x),
    yLabel: 'Density',
  };
}

// ---------------------------------------------------------------- categorical layout
// Bars, boxes, violins and dot strips share one layout: categories sit at integer
// positions on a numeric x axis, sub-groups (colour) get slots within each one.
// This keeps significance brackets, jitter and facets all on the same footing.

function categorical(ctx: Ctx, dataset: Dataset): Layout {
  const { spec, theme, fontPx } = ctx;
  const st = spec.style;
  const { x, y } = spec.enc;
  const mark = spec.mark;
  const f = facetChannels(ctx);

  let cats = x ? levels(ctx.rows, x) : [''];
  if (x && cats.length > 60) ctx.warnings.push(`${prettify(x)} has ${cats.length} categories — consider a filter`);
  const sub = ctx.colorKey && spec.enc.color !== x ? ctx.colorLevels : [''];
  const m = sub.length;
  const slotW = 0.8 / m;
  const center = (ci: number, si: number) => ci - 0.4 + slotW * (si + 0.5);
  const catOf = (r: Row) => (x ? keyOf(r[x]) : '');
  const subOf = (r: Row) => (m > 1 ? ctx.colorKey!(r) : '');
  const fillFor = (cat: string, s: string) => (m > 1 ? colorOf(ctx, s) : ctx.colorKey && spec.enc.color === x ? colorOf(ctx, cat) : single(ctx));
  const fk = facetKeys(ctx);

  const yCol = y ? columnOf(dataset, y) : undefined;
  const valueAgg: Aggregate = mark === 'bar'
    ? (!y ? 'count' : spec.stats.aggregate === 'none' ? 'mean' : spec.stats.aggregate)
    : 'none';
  if (mark !== 'bar' && (!yCol || yCol.type !== 'number')) {
    ctx.warnings.push(`${markInfo(mark).label} plots need a numeric Y.`);
  }

  // groups: facet × category × slot
  const groups = d3.groups(ctx.rows, (r) => `${fk(r)}\u0001${catOf(r)}\u0001${subOf(r)}`).map(([key, rows]) => {
    const cat = catOf(rows[0]), s = subOf(rows[0]);
    return {
      key, rows, cat, sub: s, ci: cats.indexOf(cat), si: Math.max(0, sub.indexOf(s)),
      vals: y ? rows.map((r) => r[y] as number).filter(Number.isFinite) : [],
      facet: { ...(spec.enc.facet ? { [spec.enc.facet]: rows[0][spec.enc.facet] } : {}), ...(spec.enc.facetRow ? { [spec.enc.facetRow]: rows[0][spec.enc.facetRow] } : {}) },
      fk: fk(rows[0]),
    };
  });

  // optional ordering of categories by their value
  if (spec.stats.sort !== 'none' && x) {
    const score = d3.rollup(groups, (gs) => d3.sum(gs, (g) => (valueAgg === 'count' ? g.rows.length : y ? aggregate(g.vals, valueAgg === 'none' ? 'median' : valueAgg) : 0)), (g) => g.cat);
    cats = [...cats].sort((a, b) => (spec.stats.sort === 'asc' ? 1 : -1) * ((score.get(a) ?? 0) - (score.get(b) ?? 0)));
    for (const g of groups) g.ci = cats.indexOf(g.cat);
  }

  const marks: Mark[] = [];
  const pts: Row[] = [];
  const err = valueAgg === 'mean' ? spec.stats.error : 'none';
  const mode = m > 1 ? spec.stats.barMode : 'group';
  let yTop = -Infinity;
  let yLabel = y ? prettify(y) : 'Count';

  if (mark === 'bar') {
    const bars: Row[] = [];
    yLabel = aggLabel(valueAgg, y, err);
    if (mode === 'group') {
      for (const g of groups) {
        const s = valueAgg === 'mean' ? summarize(g.vals, err) : null;
        const v = valueAgg === 'count' ? g.rows.length : s ? s.mean : aggregate(g.vals, valueAgg);
        const c = center(g.ci, g.si);
        bars.push({ ...g.facet, __x1: c - slotW * 0.44, __x2: c + slotW * 0.44, __y1: 0, __y2: v, __lo: s?.lo, __hi: s?.hi, __xc: c, __fill: fillFor(g.cat, g.sub), __t: tipText(ctx, g.cat, g.sub, `${yLabel}: ${fmtNum(v)}${s && err !== 'none' ? ` [${fmtNum(s.lo)}, ${fmtNum(s.hi)}]` : ''}\nn = ${g.rows.length}`) });
        yTop = Math.max(yTop, s && err !== 'none' ? s.hi : v);
      }
    } else {
      // stacked within each category
      const byCat = d3.group(groups, (g) => `${g.fk}\u0001${g.cat}`);
      for (const gs of byCat.values()) {
        const ordered = [...gs].sort((a, b) => a.si - b.si);
        const vals = ordered.map((g) => (valueAgg === 'count' ? g.rows.length : aggregate(g.vals, valueAgg)));
        const total = d3.sum(vals) || 1;
        let acc = 0;
        ordered.forEach((g, i) => {
          const v = mode === 'fill' ? vals[i] / total : vals[i];
          bars.push({ ...g.facet, __x1: g.ci - 0.38, __x2: g.ci + 0.38, __y1: acc, __y2: acc + v, __fill: fillFor(g.cat, g.sub), __t: tipText(ctx, g.cat, g.sub, mode === 'fill' ? `Share: ${d3.format('.1%')(v)}` : `${yLabel}: ${fmtNum(v)}`) });
          acc += v;
        });
        yTop = Math.max(yTop, acc);
      }
      if (mode === 'fill') yLabel = 'Share (%)';
    }
    const withPoints = spec.stats.points && !!y && mode === 'group';
    marks.push(Plot.rect(bars, { x1: '__x1', x2: '__x2', y1: '__y1', y2: '__y2', fill: '__fill', fillOpacity: withPoints ? 0.5 : Math.max(0.85, st.opacity), rx: 1, ...f, ...(ctx.interactive ? { title: '__t', tip: { fontSize: fontPx * 0.95 } } : {}) } as any));
    if (err !== 'none' && mode === 'group') {
      const cap = slotW * 0.12;
      const eb = bars.filter((b) => b.__lo !== undefined);
      marks.push(Plot.ruleX(eb, { x: '__xc', y1: '__lo', y2: '__hi', stroke: theme.ink, strokeWidth: 1, ...f }));
      marks.push(Plot.link(eb, { x1: (b: Row) => (b.__xc as number) - cap, x2: (b: Row) => (b.__xc as number) + cap, y1: '__hi', y2: '__hi', stroke: theme.ink, strokeWidth: 1, ...f }));
      marks.push(Plot.link(eb, { x1: (b: Row) => (b.__xc as number) - cap, x2: (b: Row) => (b.__xc as number) + cap, y1: '__lo', y2: '__lo', stroke: theme.ink, strokeWidth: 1, ...f }));
    }
    if (withPoints) pushJitter(ctx, groups, pts, center, slotW * 0.5, fillFor, true);
  }

  if (mark === 'box') {
    const boxes: Row[] = [], outliers: Row[] = [];
    for (const g of groups) {
      if (!g.vals.length) continue;
      const b = boxStats(g.vals);
      const c = center(g.ci, g.si);
      const w = slotW * 0.32;
      boxes.push({ ...g.facet, ...b, __xc: c, __x1: c - w, __x2: c + w, __fill: fillFor(g.cat, g.sub), __t: tipText(ctx, g.cat, g.sub, `Median: ${fmtNum(b.median)}\nIQR: ${fmtNum(b.q1)} – ${fmtNum(b.q3)}\nn = ${g.vals.length}`) });
      if (!spec.stats.points) for (const o of b.outliers) outliers.push({ ...g.facet, __xc: c, __y: o, __fill: fillFor(g.cat, g.sub) });
      yTop = Math.max(yTop, b.outliers.length ? Math.max(...b.outliers) : b.hi);
    }
    marks.push(Plot.ruleX(boxes, { x: '__xc', y1: 'lo', y2: 'q1', stroke: theme.ink, strokeWidth: 0.9, ...f }));
    marks.push(Plot.ruleX(boxes, { x: '__xc', y1: 'q3', y2: 'hi', stroke: theme.ink, strokeWidth: 0.9, ...f }));
    marks.push(Plot.rect(boxes, { x1: '__x1', x2: '__x2', y1: 'q1', y2: 'q3', fill: '__fill', fillOpacity: 0.55, stroke: theme.ink, strokeWidth: 0.9, rx: 1.5, ...f, ...(ctx.interactive ? { title: '__t', tip: { fontSize: fontPx * 0.95 } } : {}) } as any));
    marks.push(Plot.ruleY(boxes, { y: 'median', x1: '__x1', x2: '__x2', stroke: theme.ink, strokeWidth: 1.6, ...f }));
    if (outliers.length) marks.push(Plot.dot(outliers, { x: '__xc', y: '__y', r: st.markSize * 0.6, stroke: theme.ink, strokeWidth: 0.8, fill: 'none', ...f }));
    if (spec.stats.points) pushJitter(ctx, groups, pts, center, slotW * 0.62, fillFor, true);
  }

  if (mark === 'violin') {
    const shapes: Row[] = [], inner: Row[] = [];
    const all = groups.flatMap((g) => g.vals);
    const [lo, hi] = d3.extent(all) as [number, number];
    const span = hi - lo || 1;
    let maxD = 0;
    const dens = groups.map((g) => {
      if (g.vals.length < 2) return null;
      const glo = Math.min(...g.vals), ghi = Math.max(...g.vals);
      const grid = linspace(glo - span * 0.04, ghi + span * 0.04, 90);
      const d = kde(g.vals, grid);
      maxD = Math.max(maxD, ...d);
      return { grid, d };
    });
    groups.forEach((g, i) => {
      const k = dens[i];
      if (!k) return;
      const c = center(g.ci, g.si);
      const half = slotW * 0.45;
      k.grid.forEach((yy, j) => shapes.push({ ...g.facet, __y: yy, __x1: c - (k.d[j] / maxD) * half, __x2: c + (k.d[j] / maxD) * half, __k: g.key, __fill: fillFor(g.cat, g.sub) }));
      const b = boxStats(g.vals);
      inner.push({ ...g.facet, ...b, __xc: c, __t: tipText(ctx, g.cat, g.sub, `Median: ${fmtNum(b.median)}\nIQR: ${fmtNum(b.q1)} – ${fmtNum(b.q3)}\nn = ${g.vals.length}`) });
      yTop = Math.max(yTop, k.grid[k.grid.length - 1]);
    });
    marks.push(Plot.areaX(shapes, { y: '__y', x1: '__x1', x2: '__x2', z: '__k', fill: '__fill', fillOpacity: 0.75, stroke: '__fill', strokeWidth: 0.8, curve: 'basis', ...f } as any));
    if (spec.stats.points) pushJitter(ctx, groups, pts, center, slotW * 0.35, fillFor, true);
    marks.push(Plot.ruleX(inner, { x: '__xc', y1: 'q1', y2: 'q3', stroke: theme.ink, strokeWidth: Math.max(2.5, fontPx * 0.35), ...f }));
    marks.push(Plot.dot(inner, { x: '__xc', y: 'median', r: Math.max(1.6, fontPx * 0.2), fill: '#ffffff', stroke: theme.ink, strokeWidth: 0.6, ...f, ...(ctx.interactive ? { title: '__t', tip: { fontSize: fontPx * 0.95 } } : {}) } as any));
  }

  if (mark === 'strip') {
    pushJitter(ctx, groups, pts, center, slotW * 0.6, fillFor);
    const means: Row[] = [];
    const e = spec.stats.error === 'none' ? 'ci95' : spec.stats.error;
    for (const g of groups) {
      if (!g.vals.length) continue;
      const s = summarize(g.vals, e);
      const c = center(g.ci, g.si);
      means.push({ ...g.facet, __xc: c, __x1: c - slotW * 0.28, __x2: c + slotW * 0.28, __m: s.mean, __lo: s.lo, __hi: s.hi });
      yTop = Math.max(yTop, ...g.vals);
    }
    marks.push(Plot.ruleY(means, { y: '__m', x1: '__x1', x2: '__x2', stroke: theme.ink, strokeWidth: 1.8, ...f }));
    marks.push(Plot.ruleX(means, { x: '__xc', y1: '__lo', y2: '__hi', stroke: theme.ink, strokeWidth: 1, ...f }));
    ctx.notes.push(`Black bars: mean ${ERR_LABEL[e]}`);
  }

  if (pts.length) {
    const dots: Mark = Plot.dot(pts, { x: '__x', y: '__y', fill: '__fill', r: Math.max(1, st.markSize * (mark === 'strip' ? 0.85 : 0.6)), fillOpacity: mark === 'strip' ? st.opacity : 0.55, stroke: st.theme === 'dark' ? '#15171c' : '#fff', strokeWidth: 0.4, ...f, ...(ctx.interactive ? { title: '__t', tip: { fontSize: fontPx * 0.95 } } : {}) } as any);
    // dots go under summary lines (strip) but above boxes and bars
    if (mark === 'strip') marks.unshift(dots);
    else if (mark === 'bar') marks.splice(1, 0, dots); // above the bars, below the error bars
    else marks.push(dots);
  }

  // ---- significance
  if (spec.stats.test && y) addGroupTests(ctx, groups, marks, center, m, cats, Number.isFinite(yTop) ? yTop : 0);

  // y domain with room for brackets
  const yScale: Plot.ScaleOptions = { type: scaleType(st.yScale), nice: true, zero: mark === 'bar' || st.zeroY || undefined, percent: mark === 'bar' && mode === 'fill' };
  return {
    marks,
    x: {
      domain: [-0.6, cats.length - 0.4],
      ticks: d3.range(cats.length),
      tickFormat: (i: number) => (Number.isInteger(i) ? cats[i] ?? '' : ''),
      axis: x ? 'bottom' : null,
    },
    y: yScale,
    color: undefined,
    xLabel: x ? prettify(x) : '',
    yLabel,
    xTickLabels: cats,
    gridX: false,
  };
}

function tipText(ctx: Ctx, cat: string, sub: string, body: string) {
  const head = [ctx.spec.enc.x ? `${prettify(ctx.spec.enc.x)}: ${cat}` : '', sub ? `${prettify(ctx.spec.enc.color)}: ${sub}` : ''].filter(Boolean).join('\n');
  return head ? `${head}\n${body}` : body;
}

/** Deterministic jitter so the figure doesn't change on every render. */
function pushJitter(
  ctx: Ctx, groups: { rows: Row[]; ci: number; si: number; cat: string; sub: string; facet: Row }[], out: Row[],
  center: (ci: number, si: number) => number, width: number, fillFor: (c: string, s: string) => string, keepColor = false,
) {
  const y = ctx.spec.enc.y!;
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const g of groups) {
    const c = center(g.ci, g.si);
    const fill = keepColor ? shade(fillFor(g.cat, g.sub), ctx.spec.style.theme === 'dark') : fillFor(g.cat, g.sub);
    for (const r of g.rows) {
      const v = r[y];
      if (typeof v !== 'number') continue;
      out.push({ ...g.facet, __x: c + (rand() - 0.5) * width, __y: v, __fill: fill, __t: `${prettify(y)}: ${fmtNum(v)}` });
    }
  }
}

/** A version of a colour that stands out over a filled shape of the same hue (lighter on dark figures). */
function shade(color: string, dark = false): string {
  const c = d3.hsl(color);
  c.l = dark ? Math.min(0.88, c.l + (1 - c.l) * 0.55) : Math.max(0.12, c.l * 0.62);
  return c.formatHex();
}

function addGroupTests(
  ctx: Ctx, groups: { vals: number[]; ci: number; si: number; cat: string; sub: string; facet: Row; fk: string }[],
  marks: Mark[], center: (ci: number, si: number) => number, m: number, cats: string[], yTop: number,
) {
  const { theme, fontPx } = ctx;
  const f = facetChannels(ctx);
  const brackets: Row[] = [], labels: Row[] = [], corner: Row[] = [];
  const yLo = d3.min(groups, (g) => d3.min(g.vals)) ?? 0;
  const step = (yTop - Math.min(0, yLo)) * 0.07 || 1;

  for (const [, gs] of d3.group(groups, (g) => g.fk)) {
    const facet = gs[0].facet;
    if (m > 1) {
      // compare sub-groups within each category
      for (const [, inCat] of d3.group(gs, (g) => g.cat)) {
        const sorted = [...inCat].sort((a, b) => a.si - b.si);
        const top = Math.max(...sorted.map((g) => d3.max(g.vals) ?? 0)) + step * 0.6;
        if (sorted.length === 2) {
          const t = welch(sorted[0].vals, sorted[1].vals);
          if (!t) continue;
          brackets.push({ ...facet, __x1: center(sorted[0].ci, sorted[0].si), __x2: center(sorted[1].ci, sorted[1].si), __y: top });
          labels.push({ ...facet, __x: (center(sorted[0].ci, 0) + center(sorted[0].ci, 1)) / 2, __y: top, __t: stars(t.p), __full: `${t.name}: ${t.stat}, ${formatP(t.p)}` });
        } else if (sorted.length > 2) {
          const t = anova(sorted.map((g) => g.vals));
          if (t) labels.push({ ...facet, __x: sorted[0].ci, __y: top, __t: formatP(t.p), __full: `${t.name}: ${t.stat}, ${formatP(t.p)}` });
        }
      }
      if (m === 2) ctx.notes.push('Stars: Welch t-test between the two groups (* p<.05, ** p<.01, *** p<.001)');
      else ctx.notes.push('p-values: one-way ANOVA across groups in each category');
    } else {
      const byCat = [...gs].sort((a, b) => a.ci - b.ci);
      if (byCat.length === 2) {
        const t = welch(byCat[0].vals, byCat[1].vals);
        if (!t) continue;
        const top = yTop + step * 0.8;
        brackets.push({ ...facet, __x1: byCat[0].ci, __x2: byCat[1].ci, __y: top });
        ctx.notes.push(`${t.name}: ${t.stat}, ${formatP(t.p)}`);
        labels.push({ ...facet, __x: (byCat[0].ci + byCat[1].ci) / 2, __y: top, __t: `${stars(t.p)}  ${formatP(t.p)}`, __full: `${t.name}: ${t.stat}, ${formatP(t.p)}` });
      } else if (byCat.length > 2) {
        const t = anova(byCat.map((g) => g.vals));
        if (t) {
          corner.push({ ...facet, __t: `ANOVA, ${formatP(t.p)}`, __full: `${t.name}: ${t.stat}, ${formatP(t.p)}` });
          ctx.notes.push(`${t.name}: ${t.stat}, ${formatP(t.p)}`);
        }
      }
    }
  }
  if (brackets.length) {
    const tick = step * 0.25;
    marks.push(Plot.link(brackets, { x1: '__x1', x2: '__x2', y1: '__y', y2: '__y', stroke: theme.ink, strokeWidth: 0.9, ...f }));
    marks.push(Plot.link(brackets, { x1: '__x1', x2: '__x1', y1: (r: Row) => (r.__y as number) - tick, y2: '__y', stroke: theme.ink, strokeWidth: 0.9, ...f }));
    marks.push(Plot.link(brackets, { x1: '__x2', x2: '__x2', y1: (r: Row) => (r.__y as number) - tick, y2: '__y', stroke: theme.ink, strokeWidth: 0.9, ...f }));
  }
  if (labels.length) {
    marks.push(Plot.text(labels, { x: '__x', y: '__y', text: '__t', dy: -fontPx * 0.55, fill: theme.ink, fontSize: fontPx * 0.92, lineAnchor: 'bottom', ...halo(theme), ...f, ...(ctx.interactive ? { title: '__full' } : {}) } as any));
    // invisible point so the y domain leaves room for the label
    marks.push(Plot.dot(labels, { x: '__x', y: (r: Row) => (r.__y as number) + step * 0.9, r: 0, ...f }));
  }
  if (corner.length) {
    marks.push(Plot.text(corner, { text: '__t', frameAnchor: 'top', dy: fontPx * 0.3, fill: theme.ink, fontSize: fontPx * 0.9, lineAnchor: 'top', ...halo(theme), ...f, ...(ctx.interactive ? { title: '__full' } : {}) } as any));
    marks.push(Plot.dot(corner, { x: () => 0, y: () => yTop + step * 2.6, r: 0, ...f }));
  }
}

// ---------------------------------------------------------------- matrices

function heatmap(ctx: Ctx, dataset: Dataset): Layout {
  const { spec, fontPx } = ctx;
  const { x, y, color } = spec.enc;
  const valueCol = color && columnOf(dataset, color)?.type === 'number' ? color : undefined;
  const agg: Aggregate = valueCol ? (spec.stats.aggregate === 'none' ? 'mean' : spec.stats.aggregate) : 'count';
  const xs = levels(ctx.rows, x!), ys = levels(ctx.rows, y!);
  if (xs.length > 80 || ys.length > 80) ctx.warnings.push('Heatmaps work best with fewer than 80 categories per axis.');
  const fx = spec.enc.facet;
  const cells = d3.flatRollup(
    ctx.rows,
    (rs) => (valueCol ? aggregate(rs.map((r) => r[valueCol] as number), agg) : rs.length),
    (r) => keyOf(r[x!]), (r) => keyOf(r[y!]), (r) => (fx ? keyOf(r[fx]) : ''),
  ).map(([cx, cy, cf, v]) => ({ __x: cx, __y: cy, __v: v, ...(fx ? { [fx]: cf } : {}) }));
  const ext = d3.extent(cells, (c) => c.__v) as [number, number];
  const scheme = sequentialScheme(spec.style.palette);
  const marks: Mark[] = [
    Plot.cell(cells, { x: '__x', y: '__y', fill: '__v', inset: 0.5, ...(fx ? { fx } : {}), ...(ctx.interactive ? { title: (c: Row) => `${prettify(x)}: ${c.__x}\n${prettify(y)}: ${c.__y}\n${heatmapValueLabel(spec)}: ${fmtNum(c.__v as number)}`, tip: { fontSize: fontPx * 0.95 } } : {}) } as any),
  ];
  if (spec.stats.labels && cells.length <= 600 && xs.length <= 30) {
    marks.push(Plot.text(cells, { x: '__x', y: '__y', text: (c: Row) => fmtNum(c.__v as number), fill: (c: Row) => labelInk(scheme, ext, c.__v as number), fontSize: fontPx * 0.85, ...(fx ? { fx } : {}) } as any));
  }
  return {
    marks,
    x: { type: 'band', domain: xs, tickSize: 0 } as any,
    y: { type: 'band', domain: ys, tickSize: 0 } as any,
    color: { type: 'linear', scheme: scheme as any, domain: ext },
    xLabel: prettify(x),
    yLabel: prettify(y),
    xTickLabels: xs,
    yTickLabels: ys,
    gridX: false,
  };
}

function heatmapValueLabel(spec: Spec) {
  const c = spec.enc.color;
  if (!c) return 'Count';
  const agg = spec.stats.aggregate === 'none' ? 'mean' : spec.stats.aggregate;
  return agg === 'count' ? 'Count' : `${AGG_LABEL[agg]} ${lowerFirst(prettify(c))}`;
}

function labelInk(scheme: string, ext: [number, number], v: number) {
  const name = `interpolate${scheme.charAt(0).toUpperCase()}${scheme.slice(1)}`;
  const interp = (d3 as any)[name] ?? d3.interpolateViridis;
  const t = ext[1] === ext[0] ? 0.5 : (v - ext[0]) / (ext[1] - ext[0]);
  const c = d3.rgb(interp(t));
  const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  return lum > 0.55 ? '#111111' : '#ffffff';
}

function corr(ctx: Ctx, dataset: Dataset): Layout {
  const { spec, fontPx } = ctx;
  const cols = dataset.columns.filter((c) => c.type === 'number').slice(0, 16).map((c) => c.name);
  if (cols.length < 2) {
    ctx.warnings.push('A correlation matrix needs at least two numeric columns.');
    return { marks: [], xLabel: '', yLabel: '' };
  }
  const vec = new Map(cols.map((c) => [c, ctx.rows.map((r) => (typeof r[c] === 'number' ? (r[c] as number) : NaN))]));
  const cells: Row[] = [];
  cols.forEach((a, i) => cols.forEach((b, j) => {
    if (j > i) return; // lower triangle: every pair once
    const r = i === j ? 1 : pearson(vec.get(a)!, vec.get(b)!);
    cells.push({ __x: prettify(b), __y: prettify(a), __v: r });
  }));
  const names = cols.map(prettify);
  const marks: Mark[] = [
    Plot.cell(cells, { x: '__x', y: '__y', fill: '__v', inset: 0.75, rx: 2, ...(ctx.interactive ? { title: (c: Row) => `${c.__y} × ${c.__x}\nr = ${(c.__v as number).toFixed(3)}`, tip: { fontSize: fontPx * 0.95 } } : {}) } as any),
  ];
  if (spec.stats.labels) {
    marks.push(Plot.text(cells, { x: '__x', y: '__y', text: (c: Row) => (Number.isFinite(c.__v as number) ? (c.__v as number).toFixed(2).replace('-0.00', '0.00') : ''), fill: (c: Row) => (Math.abs(c.__v as number) > 0.55 ? '#ffffff' : '#1d1d1f'), fontSize: fontPx * 0.85 }));
  }
  ctx.notes.push(`Pearson correlation of ${cols.length} numeric columns`);
  return {
    marks,
    x: { type: 'band', domain: names, tickSize: 0 } as any,
    y: { type: 'band', domain: names, tickSize: 0 } as any,
    color: { type: 'linear', scheme: 'rdbu' as any, domain: [-1, 1] },
    xLabel: '',
    yLabel: '',
    xTickLabels: names,
    yTickLabels: names,
    gridX: false,
  };
}
