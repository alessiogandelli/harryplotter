// Small, dependency-free statistics: enough for error bars, trends and the
// common two-group / k-group tests researchers expect on a figure.

export const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

export function variance(a: number[]): number {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
}

export const sd = (a: number[]) => Math.sqrt(variance(a));

export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export const median = (a: number[]) => quantile([...a].sort((x, y) => x - y), 0.5);

// ---------------------------------------------------------------- distributions

function logGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const k of c) ser += k / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const EPS = 3e-14, FPMIN = 1e-300;
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
export function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value for Student's t with df degrees of freedom. */
export const tTwoSided = (t: number, df: number) => ibeta(df / (df + t * t), df / 2, 0.5);

/** Upper-tail p-value for F(d1, d2). */
export const fUpper = (f: number, d1: number, d2: number) => ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2);

/** Critical t for a two-sided 95% interval. */
export function tCrit95(df: number): number {
  if (!(df > 0)) return NaN;
  let lo = 0, hi = 100;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (tTwoSided(mid, df) > 0.05) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- summaries

export interface Summary { n: number; mean: number; lo: number; hi: number }

/** Mean with an error interval: sd, standard error, or 95% t confidence interval. */
export function summarize(a: number[], kind: 'none' | 'sd' | 'se' | 'ci95'): Summary {
  const m = mean(a);
  if (kind === 'none' || a.length < 2) return { n: a.length, mean: m, lo: m, hi: m };
  const s = sd(a);
  const half = kind === 'sd' ? s : kind === 'se' ? s / Math.sqrt(a.length) : (tCrit95(a.length - 1) * s) / Math.sqrt(a.length);
  return { n: a.length, mean: m, lo: m - half, hi: m + half };
}

export interface BoxStats { q1: number; median: number; q3: number; lo: number; hi: number; outliers: number[] }

export function boxStats(a: number[]): BoxStats {
  const s = [...a].sort((x, y) => x - y);
  const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), iqr = q3 - q1;
  const fenceLo = q1 - 1.5 * iqr, fenceHi = q3 + 1.5 * iqr;
  const inside = s.filter((x) => x >= fenceLo && x <= fenceHi);
  return {
    q1, q3, median: quantile(s, 0.5),
    lo: inside.length ? inside[0] : q1,
    hi: inside.length ? inside[inside.length - 1] : q3,
    outliers: s.filter((x) => x < fenceLo || x > fenceHi),
  };
}

/** Gaussian kernel density with Silverman's bandwidth, evaluated on a grid. */
export function kde(a: number[], grid: number[], bandwidth?: number): number[] {
  const n = a.length;
  if (n < 2) return grid.map(() => 0);
  const s = sd(a);
  const sorted = [...a].sort((x, y) => x - y);
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const spread = Math.min(s, iqr / 1.34) || s || 1;
  const h = bandwidth ?? 0.9 * spread * n ** -0.2;
  const k = 1 / (n * h * Math.sqrt(2 * Math.PI));
  return grid.map((g) => {
    let sum = 0;
    for (const x of a) { const u = (g - x) / h; sum += Math.exp(-0.5 * u * u); }
    return sum * k;
  });
}

export const linspace = (a: number, b: number, n: number) =>
  Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

// ---------------------------------------------------------------- relationships

export interface Regression {
  slope: number; intercept: number; r: number; r2: number; p: number; n: number;
  /** points along the fit with a 95% confidence band for the mean */
  band: { x: number; y: number; lo: number; hi: number }[];
}

export function linearRegression(xs: number[], ys: number[]): Regression | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx, intercept = my - slope * mx;
  const r = syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
  const df = n - 2;
  const t = Math.abs(r) >= 1 ? Infinity : r * Math.sqrt(df / (1 - r * r));
  const p = Number.isFinite(t) ? tTwoSided(t, df) : 0;
  const sse = Math.max(0, syy - slope * sxy);
  const se = Math.sqrt(sse / df);
  const tc = tCrit95(df);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const band = linspace(lo, hi, 60).map((x) => {
    const y = intercept + slope * x;
    const half = tc * se * Math.sqrt(1 / n + (x - mx) ** 2 / sxx);
    return { x, y, lo: y - half, hi: y + half };
  });
  return { slope, intercept, r, r2: r * r, p, n, band };
}

/** LOESS (tricube weights, local linear), evaluated on a grid. */
export function loess(xs: number[], ys: number[], span = 0.6, points = 60): { x: number; y: number }[] {
  const n = xs.length;
  if (n < 4) return [];
  const k = Math.max(3, Math.min(n, Math.round(span * n)));
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return linspace(lo, hi, points).map((x0) => {
    const d = xs.map((x) => Math.abs(x - x0));
    const radius = [...d].sort((a, b) => a - b)[k - 1] || 1e-12;
    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    for (let i = 0; i < n; i++) {
      const u = d[i] / radius;
      if (u >= 1) continue;
      const w = (1 - u ** 3) ** 3;
      sw += w; swx += w * xs[i]; swy += w * ys[i]; swxx += w * xs[i] ** 2; swxy += w * xs[i] * ys[i];
    }
    const den = sw * swxx - swx * swx;
    const y = Math.abs(den) < 1e-12 ? swy / sw : ((swxx * swy - swx * swxy) + x0 * (sw * swxy - swx * swy)) / den;
    return { x: x0, y };
  });
}

export function pearson(xs: number[], ys: number[]): number {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 3) return NaN;
  const mx = mean(pairs.map((p) => p[0])), my = mean(pairs.map((p) => p[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [a, b] of pairs) { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}

// ---------------------------------------------------------------- group tests

export interface TestResult { name: string; stat: string; p: number; value: number }

/** Welch's two-sample t-test. */
export function welch(a: number[], b: number[]): TestResult | null {
  if (a.length < 2 || b.length < 2) return null;
  const va = variance(a) / a.length, vb = variance(b) / b.length;
  if (va + vb === 0) return null;
  const t = (mean(a) - mean(b)) / Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  return { name: 'Welch t-test', stat: `t(${df.toFixed(1)}) = ${t.toFixed(2)}`, p: tTwoSided(t, df), value: t };
}

/** One-way ANOVA across k groups. */
export function anova(groups: number[][]): TestResult | null {
  const g = groups.filter((x) => x.length > 0);
  const N = g.reduce((s, x) => s + x.length, 0), k = g.length;
  if (k < 2 || N - k < 1) return null;
  const grand = mean(g.flat());
  const ssb = g.reduce((s, x) => s + x.length * (mean(x) - grand) ** 2, 0);
  const ssw = g.reduce((s, x) => s + x.reduce((t, v) => t + (v - mean(x)) ** 2, 0), 0);
  if (ssw === 0) return null;
  const f = ssb / (k - 1) / (ssw / (N - k));
  return { name: 'One-way ANOVA', stat: `F(${k - 1}, ${N - k}) = ${f.toFixed(2)}`, p: fUpper(f, k - 1, N - k), value: f };
}

export function formatP(p: number): string {
  if (!Number.isFinite(p)) return 'p = n/a';
  if (p < 0.001) return 'p < 0.001';
  return `p = ${p < 0.01 ? p.toFixed(3) : p.toFixed(2)}`;
}

export function stars(p: number): string {
  return p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : 'n.s.';
}
