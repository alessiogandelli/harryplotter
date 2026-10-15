import type { ColumnLike } from '../types/figureSpec';

/**
 * Example prompts shown in the prompt bar, tailored to the loaded dataset's
 * columns when available and falling back to generic ones otherwise. Only
 * phrasing the providers actually understand is included.
 */
export function buildExamples(columns: ColumnLike[]): string[] {
  const numeric = columns.filter((c) => c.dtype === 'numeric').map((c) => c.name);
  const categorical = columns
    .filter((c) => c.dtype === 'categorical' || c.dtype === 'boolean')
    .map((c) => c.name);
  const datetime = columns.filter((c) => c.dtype === 'datetime').map((c) => c.name);

  const [n1, n2] = numeric;
  const c1 = categorical[0];
  const d1 = datetime[0];

  const examples: Array<string | null> = [
    'do a bar plot',
    d1 && n1 ? `line chart of ${n1} over ${d1}` : null,
    d1 && n2 ? `scatter of ${n2} over ${d1}` : null,
    n1 && n2 ? `scatter of ${n1} vs ${n2}` : null,
    n1 ? `histogram of ${n1}` : null,
    n1 && c1 ? `box plot of ${n1} by ${c1}` : null,
    n1 && c1 ? `bar plot of ${n1} by ${c1}` : null,
    'move the legend to the top',
    'put the legend on the bottom in two columns',
    'use a colorblind-safe palette',
    'use a log scale on the y axis',
    'limit the x axis between 0 and 100',
    'title "My figure"',
  ];

  return examples.filter((example): example is string => example !== null);
}
