import { describe, expect, it } from 'vitest';
import { quickIntent } from '../commands';
import { parseDelimited } from '../data';
import { continuousTickCount, fitTicks, shortenAll } from '../render';
import { PALETTES } from '../spec';
import { autoSpec } from '../suggest';

const w = (t: string) => t.length * 6; // ~6 px per character
const labels = (n: number, f = (i: number) => `group ${i + 1}`) => Array.from({ length: n }, (_, i) => f(i));

describe('axis labels fit the space instead of skipping every other one', () => {
  it('keeps all 20 labels flat when the axis is wide enough', () => {
    const fit = fitTicks(labels(20), 1600, { lineH: 11, gap: 8, widthOf: w, angle: null });
    expect(fit.shown).toHaveLength(20);
    expect(fit.angle).toBe(0);
  });

  it('tilts or stands labels up before dropping any', () => {
    const fit = fitTicks(labels(24), 500, { lineH: 11, gap: 8, widthOf: w, angle: null });
    expect(fit.shown).toHaveLength(24);
    expect(fit.angle).toBeGreaterThan(0);
  });

  it('thins only as much as the space demands', () => {
    const fit = fitTicks(labels(200), 600, { lineH: 11, gap: 8, widthOf: w, angle: null });
    expect(fit.shown.length).toBeGreaterThan(30);
    expect(fit.shown.length).toBeLessThan(200);
  });

  it('shows every row label of a tall enough vertical axis', () => {
    expect(fitTicks(labels(25), 400, { lineH: 11, gap: 1, widthOf: () => 0, angle: null, vertical: true }).shown).toHaveLength(25);
  });

  it('respects an angle the user picked', () => {
    expect(fitTicks(labels(10), 300, { lineH: 11, gap: 8, widthOf: w, angle: 45 }).angle).toBe(45);
  });

  it('shortens very long names with an ellipsis', () => {
    const m = shortenAll(['short', 'a really very long category name indeed'], 60, w);
    expect(m.get('short')).toBe('short');
    expect(m.get('a really very long category name indeed')!.endsWith('…')).toBe(true);
    expect(w(m.get('a really very long category name indeed')!)).toBeLessThanOrEqual(60);
  });

  it('gives continuous axes as many round ticks as fit', () => {
    const wide = continuousTickCount([0, 100], 800, w, 16)!;
    const narrow = continuousTickCount([0, 100], 200, w, 16)!;
    expect(wide).toBeGreaterThan(narrow);
  });
});

describe('palettes', () => {
  it('are many, well formed and uniquely named', () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
    for (const p of PALETTES) {
      expect(p.colors.length, p.id).toBeGreaterThanOrEqual(5);
      for (const c of p.colors) expect(c, p.id).toMatch(/^#[0-9a-fA-F]{6}$/);
      if (p.kind !== 'categorical') expect(p.scheme, p.id).toBeTruthy();
    }
    for (const kind of ['categorical', 'sequential', 'diverging'] as const) expect(PALETTES.filter((p) => p.kind === kind).length).toBeGreaterThanOrEqual(5);
  });

  it('can be picked by name, without "paired t-test" switching palette', () => {
    const d = parseDelimited('t', 'g,v\na,1\nb,2\n');
    expect(quickIntent('spectral palette', autoSpec(d), d)!.spec.style.palette).toBe('spectral');
    expect(quickIntent('use seaborn colorblind', autoSpec(d), d)!.spec.style.palette).toBe('sns-colorblind');
    const paired = quickIntent('box plot with paired t-test', autoSpec(d), d);
    expect(paired?.spec.style.palette ?? 'okabe-ito').not.toBe('paired');
  });
});

describe('shortened names stay distinguishable', () => {
  it('cuts in the middle when the ends are what differ', () => {
    const m = shortenAll(['Sample number 11', 'Sample number 12'], 60, w);
    expect(m.get('Sample number 11')).not.toBe(m.get('Sample number 12'));
    expect(m.get('Sample number 12')!.endsWith('12')).toBe(true);
  });
});
