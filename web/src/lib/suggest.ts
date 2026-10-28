import { emptySpec } from './spec';
import { anova, pearson } from './stats';
import type { Column, Dataset, Spec } from './types';

export interface Suggestion { id: string; title: string; spec: Spec }

const TIME_LIKE = /time|hour|^h$|_h$|day|minute|^min|_min$|sec|week|month|year|dose|conc|^t$|^t_/i;
const ID_LIKE = /(^|_)(id|idx|index|key|uuid|row)$|^(id|n|no|nr)$/i;

function roles(d: Dataset) {
  const rows = d.rows.length;
  const nums = d.columns.filter((c) => c.type === 'number' && !(ID_LIKE.test(c.name) && c.unique > 0.9 * rows) && c.unique > 1);
  const dates = d.columns.filter((c) => c.type === 'date');
  const cats = d.columns
    .filter((c) => (c.type === 'category' && c.unique >= 2 && c.unique <= 24) || (c.type === 'number' && c.unique >= 2 && c.unique <= 6))
    .sort((a, b) => score(a) - score(b));
  return { nums, dates, cats };
}

// prefer categorical columns with a handful of levels
// replicates, subjects and runs are units of observation, not groups worth comparing
const REPLICATE_LIKE = /rep|replicate|subject|participant|trial|run|well|batch|sample|^id|_id$/i;
const score = (c: Column) => (c.type === 'number' ? 10 : 0) + (REPLICATE_LIKE.test(c.name) ? 20 : 0) + Math.abs(c.unique - 4);

function make(mark: Spec['mark'], enc: Spec['enc'], stats: Partial<Spec['stats']> = {}): Spec {
  const s = emptySpec();
  s.mark = mark;
  s.enc = Object.fromEntries(Object.entries(enc).filter(([, v]) => v)) as Spec['enc'];
  s.stats = { ...s.stats, ...stats };
  return s;
}

/** A handful of good first charts for this dataset, best first. */
export function suggest(d: Dataset): Suggestion[] {
  const { nums, dates, cats } = roles(d);
  const out: Suggestion[] = [];
  const small = cats.filter((c) => c.unique <= 8);
  const group = small[0];
  const group2 = small.find((c) => c !== group && c.type === 'category');

  // strongest pairwise relationship among numeric columns
  const nonGroupNums = nums.filter((c) => !small.includes(c) && !REPLICATE_LIKE.test(c.name));
  let pair: [Column, Column] | null = null;
  if (nonGroupNums.length >= 2) {
    let best = -1;
    const top = nonGroupNums.slice(0, 12);
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const r = Math.abs(pearson(d.rows.map((x) => x[top[i].name] as number), d.rows.map((x) => x[top[j].name] as number)));
      if (Number.isFinite(r) && r > best) { best = r; pair = [top[i], top[j]]; }
    }
  }
  // the measure that differs most between groups makes the most telling first chart
  let y = pair?.[1] ?? nonGroupNums[0] ?? nums[0];
  if (group && nonGroupNums.length > 1) {
    let bestF = -1;
    for (const c of nonGroupNums.slice(0, 12)) {
      const groups = [...d3group(d, group.name, c.name).values()];
      const f = anova(groups)?.value ?? -1;
      if (f > bestF) { bestF = f; y = c; }
    }
  }

  // an ordered numeric x (time, dose, concentration…) with repeated measurements reads best as lines
  const timeLike = !dates.length ? nums.find((c) => TIME_LIKE.test(c.name) && c.unique >= 5 && c.unique < d.rows.length * 0.5) : undefined;
  if (timeLike) {
    const yv = nums.find((c) => c !== timeLike && !small.includes(c));
    const tg = small.find((c) => c.type === 'category') ?? small[0];
    if (yv) out.push({ id: 'curve', title: `${yv.name} over ${timeLike.name}`, spec: make('line', { x: timeLike.name, y: yv.name, color: tg?.name, facet: small.find((c) => c !== tg && c.unique <= 4)?.name }, { error: 'se', points: true }) });
  }
  if (dates.length && nums.length) {
    const days = ((dates[0].max ?? 0) - (dates[0].min ?? 0)) / 864e5;
    const perDate = d.rows.length / Math.max(1, dates[0].unique);
    const timeBin = perDate > 3 ? 'none' : days > 3 * 365 ? 'quarter' : days > 120 ? 'month' : days > 21 ? 'week' : 'none';
    const tg = small.find((c) => c.unique <= 5);
    out.push({ id: 'time', title: `${nums[0].name} over time`, spec: make('line', { x: dates[0].name, y: nums[0].name, color: tg?.name }, { error: 'se', timeBin, points: true }) });
  }
  if (group && y) {
    out.push({ id: 'box', title: `${y.name} by ${group.name}`, spec: make('box', { x: group.name, y: y.name }, { points: d.rows.length <= 400 }) });
  }
  if (pair) {
    out.push({ id: 'scatter', title: `${pair[1].name} vs ${pair[0].name}`, spec: make('scatter', { x: pair[0].name, y: pair[1].name, color: group?.name }, { trend: 'linear' }) });
  }
  if (group && y) {
    out.push({ id: 'bar', title: `Mean ${y.name} ± 95% CI`, spec: make('bar', { x: group.name, y: y.name, color: group2?.name }, { aggregate: 'mean', error: 'ci95' }) });
    out.push({ id: 'violin', title: `Distribution of ${y.name}`, spec: make('violin', { x: group.name, y: y.name }) });
  }
  if (nums.length) {
    const h = y ?? nums[0];
    out.push({ id: 'hist', title: `Histogram of ${h.name}`, spec: make(group ? 'density' : 'histogram', { x: h.name, color: group?.name }) });
  }
  if (nums.length >= 3) out.push({ id: 'corr', title: 'Correlation matrix', spec: make('corr', {}) });
  if (cats.length >= 2) {
    const [a, b] = [cats[0], cats.find((c) => c !== cats[0])!];
    out.push({ id: 'heat', title: `${a.name} × ${b.name}`, spec: make('heatmap', { x: a.name, y: b.name, color: y?.name }, { aggregate: y ? 'mean' : 'none' }) });
  }
  if (!out.length && cats.length) out.push({ id: 'count', title: `Count by ${cats[0].name}`, spec: make('bar', { x: cats[0].name }) });
  return out;
}

export const autoSpec = (d: Dataset): Spec => suggest(d)[0]?.spec ?? emptySpec();

function d3group(d: Dataset, by: string, value: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const r of d.rows) {
    const v = r[value];
    if (typeof v !== 'number' || r[by] === null) continue;
    const k = String(r[by]);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(v);
  }
  return out;
}
