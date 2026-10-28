// The whole figure is one small, serialisable document: the Spec.
// The UI edits it, the AI patches it, the renderer and the code exporters read it.

export type ColumnType = 'number' | 'date' | 'category' | 'text';

export interface Column {
  name: string;
  type: ColumnType;
  /** distinct non-null values (capped) */
  unique: number;
  missing: number;
  /** a few distinct values, for the UI and the AI prompt */
  sample: string[];
  min?: number;
  max?: number;
}

export type Row = Record<string, unknown>;

export interface Dataset {
  name: string;
  rows: Row[];
  columns: Column[];
}

export type MarkType =
  | 'scatter'
  | 'line'
  | 'area'
  | 'bar'
  | 'histogram'
  | 'density'
  | 'box'
  | 'violin'
  | 'strip'
  | 'heatmap'
  | 'corr';

export type Aggregate = 'none' | 'mean' | 'median' | 'sum' | 'count' | 'min' | 'max';
export type ErrorKind = 'none' | 'sd' | 'se' | 'ci95';
export type TrendKind = 'none' | 'linear' | 'loess';
export type ScaleKind = 'linear' | 'log' | 'sqrt';
export type ThemeKind = 'clean' | 'classic' | 'minimal' | 'dark';
export type GridKind = 'none' | 'x' | 'y' | 'both';
export type LegendKind = 'auto' | 'top' | 'right' | 'none';
export type FontKind = 'sans' | 'serif' | 'mono';
export type BarMode = 'group' | 'stack' | 'fill';
export type SortKind = 'none' | 'asc' | 'desc';
export type TimeBin = 'none' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface Filter {
  column: string;
  /** keep only these categories */
  in?: string[];
  /** keep numeric values within [min, max] (either may be null) */
  min?: number | null;
  max?: number | null;
}

export interface Annotation {
  kind: 'hline' | 'vline';
  value: number;
  label?: string;
}

export interface Encoding {
  x?: string;
  y?: string;
  color?: string;
  size?: string;
  /** small multiples: one panel per value, side by side */
  facet?: string;
  /** small multiples: one panel per value, stacked */
  facetRow?: string;
}

export interface Stats {
  aggregate: Aggregate;
  error: ErrorKind;
  trend: TrendKind;
  /** overlay the raw observations on summary charts */
  points: boolean;
  /** r / p on trends, t-test or ANOVA on group comparisons */
  test: boolean;
  bins: number;
  /** date x axes: average within calendar periods */
  timeBin: TimeBin;
  barMode: BarMode;
  sort: SortKind;
  /** heatmap / corr: print values in cells */
  labels: boolean;
}

export interface Style {
  title: string;
  subtitle: string;
  caption: string;
  xLabel: string;
  yLabel: string;
  colorLabel: string;
  xScale: ScaleKind;
  yScale: ScaleKind;
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
  zeroY: boolean;
  /** x tick label angle in degrees; null = automatic */
  xTickAngle: number | null;
  palette: string;
  theme: ThemeKind;
  grid: GridKind;
  legend: LegendKind;
  font: FontKind;
  /** base font size in pt */
  fontSize: number;
  markSize: number;
  opacity: number;
  lineWidth: number;
  /** id of a size preset, or 'custom' */
  preset: string;
  /** physical size of the figure in millimetres */
  widthMm: number;
  heightMm: number;
}

export interface Spec {
  version: 1;
  mark: MarkType;
  enc: Encoding;
  stats: Stats;
  style: Style;
  filters: Filter[];
  annotations: Annotation[];
}

export type EncodingSlot = keyof Encoding;
