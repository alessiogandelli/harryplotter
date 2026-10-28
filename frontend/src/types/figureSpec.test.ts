import { describe, expect, it } from 'vitest';
import {
  applyDatasetColumns,
  defaultSpec,
  isRenderable,
  type ColumnLike,
} from './figureSpec';

const COLUMNS: ColumnLike[] = [
  { name: 'date', dtype: 'datetime' },
  { name: 'source', dtype: 'categorical' },
  { name: 'topic', dtype: 'categorical' },
  { name: 'sentiment', dtype: 'numeric' },
  { name: 'engagement', dtype: 'numeric' },
];

describe('isRenderable', () => {
  it('is false for a fresh scatter spec with no columns chosen', () => {
    expect(isRenderable(defaultSpec())).toBe(false);
  });

  it('is true once required columns are present', () => {
    const spec = applyDatasetColumns(defaultSpec(), COLUMNS);
    expect(isRenderable(spec)).toBe(true);
  });

  it('is false when the required colour mapping is missing', () => {
    const spec = defaultSpec();
    spec.figure.chartType = 'histogram';
    spec.figure.series[0].x = 'sentiment';
    expect(isRenderable(spec)).toBe(true);
    spec.figure.series[0].x = null;
    expect(isRenderable(spec)).toBe(false);
  });
});

describe('applyDatasetColumns', () => {
  it('picks datetime x, numeric y and a categorical colour', () => {
    const spec = applyDatasetColumns(defaultSpec(), COLUMNS);
    const series = spec.figure.series[0];
    expect(series.x).toBe('date');
    expect(series.y).toBe('sentiment');
    expect(series.color).toBe('source');
    // The title is derived by the compiler, not set here.
    expect(spec.style.title).toBeNull();
  });

  it('never overwrites an existing column mapping', () => {
    const spec = defaultSpec();
    spec.figure.series[0].x = 'engagement';
    spec.figure.series[0].y = 'sentiment';

    const result = applyDatasetColumns(spec, COLUMNS);

    expect(result.figure.series[0].x).toBe('engagement');
    expect(result.figure.series[0].color).toBeNull();
  });
});
