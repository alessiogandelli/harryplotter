import { describe, expect, it } from 'vitest';
import { anova, linearRegression, summarize, tCrit95, welch } from '../stats';

// Reference values from scipy.stats
describe('stats', () => {
  it('critical t values', () => {
    expect(tCrit95(10)).toBeCloseTo(2.2281, 3);
    expect(tCrit95(1000)).toBeCloseTo(1.9623, 3);
  });

  it('95% CI of a mean', () => {
    const s = summarize([1, 2, 3, 4, 5], 'ci95');
    expect(s.mean).toBe(3);
    expect(s.hi - s.mean).toBeCloseTo(1.9632, 3);
  });

  it('Welch t-test matches scipy', () => {
    const t = welch([5.1, 4.9, 6.2, 5.8, 6.0, 5.5], [4.1, 3.9, 4.6, 4.4, 5.0, 4.2])!;
    // scipy.stats.ttest_ind(a, b, equal_var=False) -> t=4.6188, p=0.0011268
    expect(t.p).toBeCloseTo(0.0011268, 6);
  });

  it('one-way ANOVA matches scipy', () => {
    const r = anova([[1, 2, 3], [2, 3, 4], [5, 6, 7]])!;
    // scipy.stats.f_oneway -> F=13.0, p=0.0065918
    expect(r.p).toBeCloseTo(0.0065918, 6);
  });

  it('linear regression r and p', () => {
    const r = linearRegression([1, 2, 3, 4, 5, 6], [2.1, 3.9, 6.2, 7.8, 10.1, 12.2])!;
    // scipy.stats.linregress -> slope=2.02, r=0.999105, p=1.2014e-06
    expect(r.slope).toBeCloseTo(2.02, 6);
    expect(r.r).toBeCloseTo(0.999105, 5);
    expect(r.p).toBeCloseTo(1.2014e-6, 9);
  });
});
