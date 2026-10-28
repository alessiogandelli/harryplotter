// "Improve this plot", deterministic half: draw the figure off-screen, measure
// the real text boxes, and fix the classic annoyances (overlapping labels,
// overplotting, bad bin counts, skewed axes…). Free, instant, no AI.

import { applyFilters, columnOf, levels } from './data';
import { render } from './render';
import { CATEGORICAL_MARKS, markInfo, prettify } from './spec';
import type { Dataset, Spec } from './types';

export interface Finding {
  /** what was wrong, in plain words */
  issue: string;
  /** what we did about it (absent = advice only) */
  fix?: string;
}

interface Box { x: number; y: number; w: number; h: number; text: string }

function boxes(root: Element, selector: string, origin: DOMRect): Box[] {
  return [...root.querySelectorAll(selector)].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height, text: el.textContent ?? '' };
  }).filter((b) => b.w > 0 && b.h > 0);
}

const overlaps = (a: Box, b: Box, pad = 1) =>
  a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad;

/**
 * Flat labels collide when their boxes overlap. Rotated labels collide when the
 * distance between neighbouring anchors is less than the text line height divided by
 * sin(angle) — their axis-aligned boxes always overlap, so boxes can't tell.
 */
function crowded(list: Box[], angle: number, lineHeight: number): boolean {
  if (angle <= 0 || list.length < 2) return anyOverlap(list);
  const s = [...list].sort((a, b) => a.x - b.x);
  let minStep = Infinity;
  for (let i = 1; i < s.length; i++) minStep = Math.min(minStep, (s[i].x + s[i].w) - (s[i - 1].x + s[i - 1].w));
  return minStep < (lineHeight * 0.9) / Math.sin((Math.min(angle, 90) * Math.PI) / 180);
}

function anyOverlap(list: Box[]): boolean {
  const s = [...list].sort((a, b) => a.x - b.x);
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < Math.min(s.length, i + 4); j++) if (overlaps(s[i], s[j])) return true;
  return false;
}

/** Measure a rendered figure. Must run in a browser. */
function measure(spec: Spec, dataset: Dataset) {
  const res = render(spec, dataset, { interactive: false });
  if (!res.svg) return null;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden';
  host.appendChild(res.svg);
  document.body.appendChild(host);
  try {
    const origin = res.svg.getBoundingClientRect();
    const W = origin.width, H = origin.height;
    const xTicks = boxes(res.svg, '[aria-label="x-axis tick label"] text', origin);
    const yTicks = boxes(res.svg, '[aria-label="y-axis tick label"] text', origin);
    const facetX = boxes(res.svg, '[aria-label="fx-axis tick label"] text', origin);
    const allText = boxes(res.svg, 'text', origin);
    const legend = res.svg.querySelector('[data-role="legend"]')?.getBoundingClientRect();
    const cells = boxes(res.svg, '[aria-label="cell"] rect', origin);
    const cellText = boxes(res.svg, '[aria-label="text"] text', origin);
    return {
      W, H, xTicks, yTicks, facetX,
      outside: allText.filter((b) => b.x < -1 || b.y < -1 || b.x + b.w > W + 1 || b.y + b.h > H + 1),
      legendW: legend?.width ?? 0,
      cellW: cells.length ? Math.min(...cells.map((c) => c.w)) : 0,
      cellTextW: cellText.length ? Math.max(...cellText.map((c) => c.w)) : 0,
      warnings: res.warnings,
    };
  } finally {
    host.remove();
  }
}

/** Run the checks, apply what can be fixed safely, repeat until stable. */
export function improve(input: Spec, dataset: Dataset): { spec: Spec; findings: Finding[] } {
  let spec: Spec = structuredClone(input);
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const add = (key: string, f: Finding) => { if (!seen.has(key)) { seen.add(key); findings.push(f); } };
  const rows = applyFilters(dataset.rows, spec.filters);
  const m = spec.mark;
  const st = () => spec.style;

  // ---- checks that need no layout
  if (st().fontSize < 6) {
    add('font', { issue: `Text at ${st().fontSize} pt is below the 6 pt most journals accept.`, fix: 'Raised the base font to 6.5 pt.' });
    spec.style.fontSize = 6.5;
  }

  if ((m === 'scatter' || m === 'strip') && spec.enc.y) {
    const perPanel = rows.length / Math.max(1, (spec.enc.facet ? levels(rows, spec.enc.facet).length : 1) * (spec.enc.facetRow ? levels(rows, spec.enc.facetRow).length : 1));
    if (perPanel > 600 && st().opacity > 0.4) {
      add('overplot', { issue: `About ${Math.round(perPanel)} points per panel hide each other.`, fix: 'Made points smaller and semi-transparent so density shows.' });
      spec.style.opacity = perPanel > 3000 ? 0.18 : 0.32;
      spec.style.markSize = Math.min(st().markSize, perPanel > 3000 ? 1.4 : 2.2);
    }
  }

  if (m === 'line' && spec.stats.points && spec.enc.x) {
    const xs = levels(rows, spec.enc.x).length;
    if (xs > 60) {
      add('markers', { issue: `${xs} markers per line turn it into a thick smear.`, fix: 'Hid the markers; the line already shows each value.' });
      spec.stats.points = false;
    }
  }

  if (m === 'histogram' && spec.enc.x) {
    const n = rows.length;
    const ideal = Math.round(Math.min(80, Math.max(8, Math.sqrt(n) * 1.3)));
    if (spec.stats.bins > n / 3 || spec.stats.bins < ideal / 3) {
      add('bins', { issue: `${spec.stats.bins} bins for ${n} values gives a ${spec.stats.bins > n / 3 ? 'spiky, mostly empty' : 'blocky'} histogram.`, fix: `Set ${ideal} bins.` });
      spec.stats.bins = ideal;
    }
  }

  // strongly skewed positive values read better on a log axis
  const yCol = columnOf(dataset, spec.enc.y);
  if (yCol?.type === 'number' && st().yScale === 'linear' && ['scatter', 'box', 'strip', 'violin', 'line'].includes(m)) {
    const vals = rows.map((r) => r[yCol.name]).filter((v): v is number => typeof v === 'number');
    const pos = vals.filter((v) => v > 0);
    if (vals.length > 10 && pos.length === vals.length) {
      const sorted = [...pos].sort((a, b) => a - b);
      const p05 = sorted[Math.floor(sorted.length * 0.05)], p95 = sorted[Math.floor(sorted.length * 0.95)];
      if (p05 > 0 && p95 / p05 > 200) {
        add('logy', { issue: `${prettify(yCol.name)} spans more than two orders of magnitude, so most data is squashed at the bottom.`, fix: 'Switched Y to a log scale.' });
        spec.style.yScale = 'log';
      }
    }
  }

  const sameAsX = spec.enc.color && spec.enc.color === spec.enc.x && CATEGORICAL_MARKS.includes(m);
  if (sameAsX && (columnOf(dataset, spec.enc.color)?.unique ?? 0) > 8) {
    add('color-dup', { issue: 'Colour repeats the X axis with more groups than distinguishable colours.', fix: 'Removed the colour; the axis already names each group.' });
    delete spec.enc.color;
  } else if (sameAsX && st().legend !== 'none') {
    add('legend-dup', { issue: 'The legend repeats the categories already named on the X axis.', fix: 'Removed the redundant legend.' });
    spec.style.legend = 'none';
  }

  const colorCol = columnOf(dataset, spec.enc.color);
  if (colorCol && colorCol.type === 'category' && colorCol.unique > 8 && markInfo(m).slots.includes('color')) {
    add('many-colors', { issue: `${colorCol.unique} colour groups are hard to tell apart; rare ones are merged into “Other”.` + (spec.enc.facet ? '' : ' Consider panels instead.') });
  }

  // ---- layout checks: render, measure, fix, repeat
  for (let pass = 0; pass < 4; pass++) {
    const g = measure(spec, dataset);
    if (!g) break;
    let changed = false;

    const lineH = g.yTicks.length ? Math.min(...g.yTicks.map((b) => b.h)) : st().fontSize * 1.2;
    const autoAngle = g.xTicks.some((b) => b.h > lineH * 1.6) ? 35 : 0;
    if (crowded(g.xTicks, st().xTickAngle ?? autoAngle, lineH)) {
      const cur = st().xTickAngle;
      const next = cur === null || cur < 45 ? 45 : cur < 90 ? 90 : null;
      if (next !== null) {
        add('xticks', { issue: 'X axis labels overlap each other.', fix: `Rotated them to ${next}°.` });
        spec.style.xTickAngle = next;
        changed = true;
      } else if (CATEGORICAL_MARKS.includes(m) && spec.stats.sort === 'none') {
        add('xticks-sort', { issue: 'Too many categories to label legibly.', fix: 'Sorted the categories by value so the pattern reads despite the labels.' });
        spec.stats.sort = 'desc';
        changed = true;
      }
    }

    if (anyOverlap(g.facetX)) {
      if (!spec.enc.facetRow && spec.enc.facet && markInfo(m).slots.includes('facetRow')) {
        add('facets', { issue: 'Panel titles collide: too many panels side by side.', fix: 'Stacked the panels in rows instead.' });
        spec.enc.facetRow = spec.enc.facet;
        delete spec.enc.facet;
        changed = true;
      } else {
        add('facets-advice', { issue: 'Panel titles collide; try a wider size preset or fewer panels.' });
      }
    }

    if (g.legendW > g.W * 0.32 && st().legend !== 'top' && st().legend !== 'none') {
      add('legend', { issue: 'The legend eats a third of the width.', fix: 'Moved the legend above the plot.' });
      spec.style.legend = 'top';
      changed = true;
    }

    if (g.cellW > 0 && g.cellTextW > g.cellW * 0.95 && spec.stats.labels) {
      add('cells', { issue: 'Numbers do not fit inside the heatmap cells.', fix: 'Hid the cell numbers (hover still shows them).' });
      spec.stats.labels = false;
      changed = true;
    }

    const outsideTitle = g.outside.find((b) => b.text && b.text === st().title);
    if (outsideTitle) {
      add('title', { issue: 'The title is wider than the figure.', fix: 'Reduced the text size; a shorter title would read better.' });
      spec.style.fontSize = Math.max(6, st().fontSize - 1);
      changed = true;
    } else if (g.outside.length) {
      add('overflow', { issue: `Some text runs off the figure edge (“${g.outside[0].text.slice(0, 30)}”).`, fix: 'Reduced the font size slightly.' });
      spec.style.fontSize = Math.max(6, st().fontSize - 0.5);
      changed = true;
    }

    if (!changed) break;
  }

  return { spec, findings };
}
