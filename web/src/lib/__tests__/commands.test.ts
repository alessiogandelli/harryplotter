import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { quickIntent } from '../commands';
import { levels, parseDelimited } from '../data';
import { autoSpec, suggest } from '../suggest';

const d = parseDelimited('rt', readFileSync(join(__dirname, '../../../public/samples/reaction_times.csv'), 'utf8'));

describe('offline phrases', () => {
  it('understands short instructions without AI', () => {
    const out = quickIntent('violin of rt_ms by condition, color by session, log y, nature', autoSpec(d), d)!;
    expect(out.spec.mark).toBe('violin');
    expect(out.spec.enc).toMatchObject({ x: 'condition', y: 'rt_ms', color: 'session' });
    expect(out.spec.style.yScale).toBe('log');
    expect(out.spec.style.preset).toBe('nature-1');
  });

  it('works in Italian too', () => {
    const out = quickIntent('istogramma, colorato per sex, bianco e nero', autoSpec(d), d)!;
    expect(out.spec.mark).toBe('histogram');
    expect(out.spec.enc.color).toBe('sex');
    expect(out.spec.style.palette).toBe('grayscale');
  });

  it('returns null for gibberish', () => {
    expect(quickIntent('qwerty zxcv', autoSpec(d), d)).toBeNull();
  });
});

describe('natural order', () => {
  it('puts the control group first and doses in increasing order', () => {
    expect(levels(d.rows, 'condition')).toEqual(['control', 'low dose', 'high dose']);
    expect(levels([{ m: 'Mar' }, { m: 'Jan' }, { m: 'Feb' }], 'm')).toEqual(['Jan', 'Feb', 'Mar']);
    expect(levels([{ r: 'n.s.' }, { r: 'up' }, { r: 'down' }], 'r')).toEqual(['down', 'up', 'n.s.']);
  });
});

describe('suggestions', () => {
  it('starts from a sensible chart and skips replicate-like columns', () => {
    const s = suggest(d);
    expect(s[0].spec.mark).toBe('box');
    // accuracy differs most between conditions in this dataset (ANOVA F 10.6 vs 8.9 for rt_ms)
    expect(s[0].spec.enc).toMatchObject({ x: 'condition', y: 'accuracy' });
    expect(s.every((x) => x.spec.enc.y !== 'trial')).toBe(true);
  });
});
