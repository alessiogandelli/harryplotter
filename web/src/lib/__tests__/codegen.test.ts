import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toPython, toR } from '../codegen';
import { parseDelimited } from '../data';
import { emptySpec, normalizeSpec } from '../spec';
import type { Spec } from '../types';

const samples = join(__dirname, '../../../public/samples');
const rt = parseDelimited('reaction_times', readFileSync(join(samples, 'reaction_times.csv'), 'utf8'));
const pol = parseDelimited('polarization_topics', readFileSync(join(samples, 'polarization_topics.csv'), 'utf8'));
const growth = parseDelimited('growth_curves', readFileSync(join(samples, 'growth_curves.csv'), 'utf8'));

const make = (p: Omit<Partial<Spec>, 'stats' | 'style'> & { stats?: Partial<Spec['stats']>; style?: Partial<Spec['style']> }) => {
  const s = emptySpec();
  return normalizeSpec({ ...s, ...p, stats: { ...s.stats, ...p.stats }, style: { ...s.style, ...p.style } });
};

export const CASES = [
  { name: 'scatter_trend', d: rt, spec: make({ mark: 'scatter', enc: { x: 'accuracy', y: 'rt_ms', color: 'condition' }, stats: { trend: 'linear', test: true } }) },
  { name: 'line_time', d: pol, spec: make({ mark: 'line', enc: { x: 'date', y: 'sentiment', color: 'source' }, stats: { error: 'se', timeBin: 'month', points: true } }) },
  { name: 'line_facets', d: growth, spec: make({ mark: 'line', enc: { x: 'time_h', y: 'od600', color: 'strain', facet: 'temperature_C' }, stats: { error: 'ci95' }, style: { yScale: 'log' } }) },
  { name: 'area', d: growth, spec: make({ mark: 'area', enc: { x: 'time_h', y: 'od600', color: 'strain' } }) },
  { name: 'bar_ci', d: rt, spec: make({ mark: 'bar', enc: { x: 'condition', y: 'rt_ms', color: 'session' }, stats: { aggregate: 'mean', error: 'ci95', points: true, test: true } }) },
  { name: 'bar_custom_colors', d: rt, spec: make({ mark: 'bar', enc: { x: 'condition', y: 'rt_ms', color: 'session' }, stats: { error: 'se' }, style: { colors: { post: '#ff00aa' } } }) },
  { name: 'single_color', d: rt, spec: make({ mark: 'violin', enc: { x: 'condition', y: 'rt_ms' }, style: { colors: { '*': '#336699' } } }) },
  { name: 'bar_stack', d: pol, spec: make({ mark: 'bar', enc: { x: 'topic', color: 'polarization' }, stats: { barMode: 'fill' } }) },
  { name: 'hist', d: pol, spec: make({ mark: 'histogram', enc: { x: 'sentiment', color: 'polarization' }, stats: { bins: 25 } }) },
  { name: 'density', d: rt, spec: make({ mark: 'density', enc: { x: 'rt_ms', color: 'condition', facet: 'session' }, stats: { points: true } }) },
  { name: 'box', d: rt, spec: make({ mark: 'box', enc: { x: 'condition', y: 'rt_ms', color: 'session' }, stats: { points: true } }) },
  { name: 'violin', d: rt, spec: make({ mark: 'violin', enc: { x: 'condition', y: 'rt_ms' }, stats: { test: true }, style: { theme: 'classic', font: 'serif', title: 'Violin' } }) },
  { name: 'strip', d: rt, spec: make({ mark: 'strip', enc: { x: 'condition', y: 'rt_ms', color: 'sex' }, stats: { error: 'se' } }) },
  { name: 'heatmap', d: pol, spec: make({ mark: 'heatmap', enc: { x: 'topic', y: 'source', color: 'engagement' } }) },
  { name: 'corr', d: pol, spec: make({ mark: 'corr', enc: {} }) },
  {
    name: 'filters_annotations', d: rt, spec: make({
      mark: 'box', enc: { x: 'condition', y: 'rt_ms' },
      filters: [{ column: 'session', in: ['post'] }, { column: 'accuracy', min: 0.7, max: null }],
      annotations: [{ kind: 'hline', value: 500, label: 'baseline' }],
      style: { legend: 'none', caption: 'n = 24', yMin: 250, yMax: 750 },
    }),
  },
];

describe('code export', () => {
  it.each(CASES)('$name produces Python and R', ({ name, d, spec }) => {
    const py = toPython(spec, d);
    const r = toR(spec, d);
    expect(py).toContain('savefig');
    expect(r).toContain('ggsave');
    for (const c of Object.values(spec.style.colors)) { expect(py).toContain(c); expect(r).toContain(c); }
    // write them out so the Python suite can execute them (see python/tests/test_codegen.py)
    const dir = process.env.HP_CODEGEN_OUT;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${name}.py`), py.replace(/plt\.show\(\)\n?$/, ''));
      writeFileSync(join(dir, `${name}.R`), r);
    }
  });
});
