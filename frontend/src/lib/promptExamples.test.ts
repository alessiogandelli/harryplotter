import { describe, expect, it } from 'vitest';
import type { ColumnLike } from '../types/figureSpec';
import { buildExamples } from './promptExamples';

const COLUMNS: ColumnLike[] = [
  { name: 'date', dtype: 'datetime' },
  { name: 'source', dtype: 'categorical' },
  { name: 'topic', dtype: 'categorical' },
  { name: 'sentiment', dtype: 'numeric' },
  { name: 'engagement', dtype: 'numeric' },
];

describe('buildExamples', () => {
  it('uses real column names when a dataset is present', () => {
    const examples = buildExamples(COLUMNS);
    expect(examples).toContain('box plot of sentiment by source');
    expect(examples).toContain('line chart of sentiment over date');
    expect(examples).toContain('histogram of sentiment');
    expect(examples).toContain('do a bar plot');
  });

  it('falls back to generic examples without columns', () => {
    const examples = buildExamples([]);
    expect(examples).toContain('do a bar plot');
    expect(examples).toContain('move the legend to the top');
    expect(examples.some((e) => e.includes(' by '))).toBe(false);
  });

  it('never includes entries requiring missing column kinds', () => {
    const onlyNumeric: ColumnLike[] = [{ name: 'score', dtype: 'numeric' }];
    const examples = buildExamples(onlyNumeric);
    expect(examples).toContain('histogram of score');
    expect(examples.some((e) => e.includes(' over '))).toBe(false);
    expect(examples.some((e) => e.includes(' by '))).toBe(false);
  });
});
